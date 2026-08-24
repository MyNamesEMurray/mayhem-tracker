-- Materialize the community aggregate views.
--
-- Why: champion_stats / augment_stats / item_stats were plain views, so every
-- PostgREST request re-ran the whole aggregate from the base tables. At 136k
-- matches that is 1.36M participant rows and 5.3M augment rows per request,
-- and the anon role has a 3s statement timeout — augment_stats started
-- returning HTTP 500 (57014, "canceling statement due to statement timeout").
-- Paging made it worse: the clients read these views 1000 rows at a time, and
-- each page re-ran the aggregate in full.
--
-- The aggregates are computed on a schedule instead, into a private schema.
-- The public views keep their names, columns and grants, so nothing on the
-- website or in the app has to change to be correct — they just get a table
-- scan of a few hundred thousand pre-computed rows instead of a 5M-row
-- hash aggregate that spills to disk.
--
-- Run this in the Supabase SQL editor as the postgres role. Steps 1 and 2 are
-- the slow ones (a few minutes); run them first and let them finish before
-- step 3 swaps the views over, so the site never reads an empty view.

-- Big work_mem keeps the augment aggregate from spilling to 64 disk
-- partitions. Session-local: it does not change the instance default.
set work_mem = '256MB';

-- ---------------------------------------------------------------------------
-- Step 1: the materialized aggregates, in a schema PostgREST does not expose
-- ---------------------------------------------------------------------------

create schema if not exists stats;
revoke all on schema stats from anon, authenticated;

create materialized view stats.champion_stats as
  select m.game_version as patch, m.queue_id, p.champion_id,
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
    from match_participants p
    join matches m on m.platform = p.platform and m.game_id = p.game_id
   group by 1, 2, 3;

create materialized view stats.augment_stats as
  select m.game_version as patch, m.queue_id, a.augment_id, a.champion_id,
         count(*) as picks,
         count(*) filter (where a.win) as wins,
         sum(p.kills) as kills,
         sum(p.deaths) as deaths,
         sum(p.assists) as assists,
         sum(p.total_damage_dealt) as damage
    from match_participant_augments a
    join matches m on m.platform = a.platform and m.game_id = a.game_id
    join match_participants p on p.platform = a.platform
                            and p.game_id = a.game_id
                            and p.participant_id = a.participant_id
   group by 1, 2, 3, 4;

-- The Augments tab wants one row per augment per patch, not per augment per
-- champion: 4k rows instead of 341k. Rolled up here so the tab can load the
-- whole thing at once, while the per-champion grain stays a per-champion
-- request from the champion page.
create materialized view stats.augment_totals as
  select patch, queue_id, augment_id,
         sum(picks)::bigint as picks,
         sum(wins)::bigint as wins,
         sum(kills)::bigint as kills,
         sum(deaths)::bigint as deaths,
         sum(assists)::bigint as assists,
         sum(damage)::bigint as damage
    from stats.augment_stats
   group by 1, 2, 3;

create materialized view stats.item_stats as
  select m.game_version as patch, m.queue_id, p.champion_id, i.item_id,
         count(*) as picks,
         count(*) filter (where p.win) as wins
    from match_participants p
    join matches m on m.platform = p.platform and m.game_id = p.game_id
    cross join lateral (values (p.item0), (p.item1), (p.item2), (p.item3),
                               (p.item4), (p.item5), (p.item6)) i(item_id)
   where i.item_id is not null
     and i.item_id > 0
     and i.item_id <> all (array[2052, 220013])
   group by 1, 2, 3, 4;

-- How much of the champion-vs-champion matchup space the database has
-- actually seen: one row per unordered pair of champions that have faced each
-- other, mirror matchups included. It is a 3.4M-pair distinct over every
-- participant, so it is computed on the schedule with everything else rather
-- than per page view.
create materialized view stats.matchup_coverage as
  select count(*)::bigint as matchups,
         (select count(distinct champion_id) from match_participants)::bigint as champions
    from (select distinct
                 least(p1.champion_id, p2.champion_id) as a,
                 greatest(p1.champion_id, p2.champion_id) as b
            from match_participants p1
            join match_participants p2 on p2.platform = p1.platform
                                     and p2.game_id = p1.game_id
                                     and p2.team_id <> p1.team_id) pairs;

create materialized view stats.item_purchase_stats as
  select m.game_version as patch, m.queue_id, p.champion_id, f.item_id,
         count(*) as picks,
         count(*) filter (where p.win) as wins,
         round(avg(f.first_buy_s))::integer as avg_first_buy_s
    from (select platform, game_id, participant_id, item_id,
                 min(game_time) as first_buy_s
            from match_item_events
           where action = 'add'
           group by 1, 2, 3, 4) f
    join match_participants p using (platform, game_id, participant_id)
    join matches m using (platform, game_id)
   group by 1, 2, 3, 4;

-- ---------------------------------------------------------------------------
-- Step 2: indexes
--
-- The unique index on the group key is what lets REFRESH run CONCURRENTLY,
-- which matters more than it sounds: a plain refresh takes an exclusive lock
-- for its whole duration, and readers would get errors rather than stale
-- numbers. game_version is nullable, hence NULLS NOT DISTINCT.
--
-- The patch and champion indexes serve the filters the clients send.
-- ---------------------------------------------------------------------------

create unique index champion_stats_key on stats.champion_stats
  (patch, queue_id, champion_id) nulls not distinct;
create index champion_stats_patch on stats.champion_stats (patch);

create unique index augment_stats_key on stats.augment_stats
  (patch, queue_id, augment_id, champion_id) nulls not distinct;
create index augment_stats_patch on stats.augment_stats (patch);
create index augment_stats_champion on stats.augment_stats (champion_id);
create index augment_stats_augment on stats.augment_stats (augment_id);

create unique index augment_totals_key on stats.augment_totals
  (patch, queue_id, augment_id) nulls not distinct;

create unique index item_stats_key on stats.item_stats
  (patch, queue_id, champion_id, item_id) nulls not distinct;
create index item_stats_patch on stats.item_stats (patch);
create index item_stats_champion on stats.item_stats (champion_id);

-- One row, but REFRESH CONCURRENTLY still wants a unique index
create unique index matchup_coverage_key on stats.matchup_coverage (matchups);

create unique index item_purchase_stats_key on stats.item_purchase_stats
  (patch, queue_id, champion_id, item_id) nulls not distinct;
create index item_purchase_stats_patch on stats.item_purchase_stats (patch);

analyze stats.champion_stats;
analyze stats.augment_stats;
analyze stats.augment_totals;
analyze stats.item_stats;
analyze stats.item_purchase_stats;
analyze stats.matchup_coverage;

-- ---------------------------------------------------------------------------
-- Step 3: point the public views at the materialized copies
--
-- Same names, same columns, same grants — the clients are unchanged. The
-- views are owner-rights (not security_invoker) by design, so anon can read
-- them without any grant on the stats schema itself.
-- ---------------------------------------------------------------------------

drop view if exists public.champion_stats;
create view public.champion_stats as select * from stats.champion_stats;

drop view if exists public.augment_stats;
create view public.augment_stats as select * from stats.augment_stats;

drop view if exists public.augment_totals;
create view public.augment_totals as select * from stats.augment_totals;

drop view if exists public.item_stats;
create view public.item_stats as select * from stats.item_stats;

drop view if exists public.matchup_coverage;
create view public.matchup_coverage as select * from stats.matchup_coverage;

drop view if exists public.item_purchase_stats;
create view public.item_purchase_stats as select * from stats.item_purchase_stats;

grant select on public.champion_stats to anon, authenticated, service_role;
grant select on public.augment_stats to anon, authenticated, service_role;
grant select on public.augment_totals to anon, authenticated, service_role;
grant select on public.item_stats to anon, authenticated, service_role;
grant select on public.item_purchase_stats to anon, authenticated, service_role;
grant select on public.matchup_coverage to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Step 4: keep them current
--
-- Refreshed on a schedule rather than on ingest: an upload should not wait on
-- a five-million-row aggregate, and the site's numbers being twenty minutes
-- behind is invisible next to it returning 500.
-- ---------------------------------------------------------------------------

create or replace function stats.refresh_all() returns void
language plpgsql
security definer
set search_path = stats, public
as $$
begin
  set local work_mem = '256MB';
  refresh materialized view concurrently stats.champion_stats;
  refresh materialized view concurrently stats.augment_stats;
  refresh materialized view concurrently stats.augment_totals;
  refresh materialized view concurrently stats.item_stats;
  refresh materialized view concurrently stats.item_purchase_stats;
  refresh materialized view concurrently stats.matchup_coverage;
end;
$$;

revoke all on function stats.refresh_all() from public, anon, authenticated;

select cron.schedule('refresh-community-stats', '*/20 * * * *',
                     $$select stats.refresh_all()$$);
