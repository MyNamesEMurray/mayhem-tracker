-- Large raw match tables should never be re-aggregated on every public page load.
-- The production database now exposes precomputed, indexed aggregate surfaces.

create materialized view public.champion_stats_mv as
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
from public.match_participants p
join public.matches m on m.platform=p.platform and m.game_id=p.game_id
group by m.game_version,m.queue_id,p.champion_id;

create unique index champion_stats_mv_uq on public.champion_stats_mv(patch,queue_id,champion_id);

create materialized view public.augment_stats_mv as
select m.game_version as patch,m.queue_id,a.augment_id,a.champion_id,
       count(*) as picks,
       count(*) filter (where a.win) as wins,
       sum(p.kills) as kills,
       sum(p.deaths) as deaths,
       sum(p.assists) as assists,
       sum(p.total_damage_dealt) as damage
from public.match_participant_augments a
join public.matches m on m.platform=a.platform and m.game_id=a.game_id
join public.match_participants p on p.platform=a.platform and p.game_id=a.game_id and p.participant_id=a.participant_id
group by m.game_version,m.queue_id,a.augment_id,a.champion_id;

create unique index augment_stats_mv_uq on public.augment_stats_mv(patch,queue_id,augment_id,champion_id);

create materialized view public.item_stats_mv as
select m.game_version as patch,m.queue_id,p.champion_id,i.item_id,
       count(*) as picks,
       count(*) filter (where p.win) as wins
from public.match_participants p
join public.matches m on m.platform=p.platform and m.game_id=p.game_id
cross join lateral (values(p.item0),(p.item1),(p.item2),(p.item3),(p.item4),(p.item5),(p.item6)) i(item_id)
where i.item_id is not null and i.item_id>0 and i.item_id <> all(array[2052,220013])
group by m.game_version,m.queue_id,p.champion_id,i.item_id;

create unique index item_stats_mv_uq on public.item_stats_mv(patch,queue_id,champion_id,item_id);

create materialized view public.item_purchase_stats_mv as
select m.game_version as patch,m.queue_id,p.champion_id,f.item_id,
       count(*) as picks,
       count(*) filter (where p.win) as wins,
       round(avg(f.first_buy_s))::integer as avg_first_buy_s
from (
  select e.platform,e.game_id,e.participant_id,e.item_id,min(e.game_time) as first_buy_s
  from public.match_item_events e
  where e.action='add'
  group by e.platform,e.game_id,e.participant_id,e.item_id
) f
join public.match_participants p using(platform,game_id,participant_id)
join public.matches m using(platform,game_id)
group by m.game_version,m.queue_id,p.champion_id,f.item_id;

create unique index item_purchase_stats_mv_uq on public.item_purchase_stats_mv(patch,queue_id,champion_id,item_id);

create or replace view public.champion_stats as select * from public.champion_stats_mv;
create or replace view public.augment_stats as select * from public.augment_stats_mv;
create or replace view public.item_stats as select * from public.item_stats_mv;
create or replace view public.item_purchase_stats as select * from public.item_purchase_stats_mv;

create or replace function public.refresh_stats() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view champion_stats_mv;
  refresh materialized view augment_stats_mv;
  refresh materialized view item_stats_mv;
  refresh materialized view item_purchase_stats_mv;
end;
$$;
revoke all on function public.refresh_stats() from public;
