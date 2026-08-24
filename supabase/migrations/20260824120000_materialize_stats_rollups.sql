-- The public stat views aggregated every participant row on every request. At
-- 136k games (1.4M participants, 5.3M augment picks) that stopped fitting in
-- anon's 3s statement timeout, and the site started serving HTTP 500s
-- ("canceling statement due to statement timeout") for champion_stats and
-- augment_stats. This moves the aggregation into materialized views that a
-- scheduled job rebuilds; 20260824120100 repoints the public views at them.

create schema if not exists stats;
revoke all on schema stats from public;

create materialized view stats.champion_stats as
select m.game_version as patch,
       m.queue_id,
       p.champion_id,
       count(*) as games,
       count(*) filter (where p.win) as wins,
       sum(p.kills) as kills,
       sum(p.deaths) as deaths,
       sum(p.assists) as assists,
       sum(p.total_damage_dealt) as damage,
       sum(p.total_damage_taken) as damage_taken,
       sum(p.total_heal) as heal,
       sum(p.gold_earned) as gold,
       sum(p.penta_kills) as pentas
  from public.match_participants p
  join public.matches m on m.platform = p.platform and m.game_id = p.game_id
 where m.game_version is not null and m.queue_id is not null
 group by m.game_version, m.queue_id, p.champion_id
  with no data;

-- Every rollup needs a unique index: it is what lets the scheduled rebuild run
-- CONCURRENTLY instead of locking readers out for the length of the refresh.
-- It doubles as the index behind the clients' keyset ordering.
create unique index champion_stats_key
    on stats.champion_stats (patch, queue_id, champion_id);

create materialized view stats.augment_stats as
select m.game_version as patch,
       m.queue_id,
       a.augment_id,
       a.champion_id,
       count(*) as picks,
       count(*) filter (where a.win) as wins,
       sum(p.kills) as kills,
       sum(p.deaths) as deaths,
       sum(p.assists) as assists,
       sum(p.total_damage_dealt) as damage
  from public.match_participant_augments a
  join public.matches m on m.platform = a.platform and m.game_id = a.game_id
  join public.match_participants p on p.platform = a.platform
                                  and p.game_id = a.game_id
                                  and p.participant_id = a.participant_id
 where m.game_version is not null and m.queue_id is not null
 group by m.game_version, m.queue_id, a.augment_id, a.champion_id
  with no data;

create unique index augment_stats_key
    on stats.augment_stats (patch, queue_id, augment_id, champion_id);

create materialized view stats.item_stats as
select m.game_version as patch,
       m.queue_id,
       p.champion_id,
       i.item_id,
       count(*) as picks,
       count(*) filter (where p.win) as wins
  from public.match_participants p
  join public.matches m on m.platform = p.platform and m.game_id = p.game_id
 cross join lateral (values (p.item0), (p.item1), (p.item2), (p.item3),
                            (p.item4), (p.item5), (p.item6)) i(item_id)
 where i.item_id is not null
   and i.item_id > 0
   and i.item_id <> all (array[2052, 220013])
   and m.game_version is not null
   and m.queue_id is not null
 group by m.game_version, m.queue_id, p.champion_id, i.item_id
  with no data;

create unique index item_stats_key
    on stats.item_stats (patch, queue_id, champion_id, item_id);

create materialized view stats.item_purchase_stats as
select m.game_version as patch,
       m.queue_id,
       p.champion_id,
       f.item_id,
       count(*) as picks,
       count(*) filter (where p.win) as wins,
       round(avg(f.first_buy_s))::integer as avg_first_buy_s
  from (select platform, game_id, participant_id, item_id,
               min(game_time) as first_buy_s
          from public.match_item_events
         where action = 'add'
         group by platform, game_id, participant_id, item_id) f
  join public.match_participants p using (platform, game_id, participant_id)
  join public.matches m using (platform, game_id)
 where m.game_version is not null and m.queue_id is not null
 group by m.game_version, m.queue_id, p.champion_id, f.item_id
  with no data;

create unique index item_purchase_stats_key
    on stats.item_purchase_stats (patch, queue_id, champion_id, item_id);

-- Rebuilds every rollup in the schema. A view that has never been populated
-- has to be refreshed non-concurrently once; after that the refresh runs
-- concurrently so readers keep seeing the previous copy throughout. The
-- advisory lock keeps a long rebuild from being lapped by the next scheduled
-- one, and the timeout override lets a rebuild outrun any role default.
create or replace function stats.refresh_all() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not pg_try_advisory_lock(hashtext('stats.refresh_all')) then
    raise notice 'stats.refresh_all() already running; skipping';
    return;
  end if;
  perform set_config('statement_timeout', '0', true);
  begin
    for v in select c.oid::regclass as rel, c.relispopulated
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'stats' and c.relkind = 'm'
              order by c.relname
    loop
      if v.relispopulated then
        execute format('refresh materialized view concurrently %s', v.rel);
      else
        execute format('refresh materialized view %s', v.rel);
      end if;
    end loop;
  exception when others then
    perform pg_advisory_unlock(hashtext('stats.refresh_all'));
    raise;
  end;
  perform pg_advisory_unlock(hashtext('stats.refresh_all'));
end;
$$;

revoke all on function stats.refresh_all() from public;
