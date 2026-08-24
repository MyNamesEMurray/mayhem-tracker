-- Follow-up to 20260824000000_materialize_stats_aggregates.sql, which is what
-- got the site off HTTP 500. Three things that migration left open:
--
--   1. Nothing refreshes the aggregates, so they are frozen at the moment they
--      were built. refresh_stats() exists but nobody calls it.
--   2. Its REFRESH takes an exclusive lock for the whole rebuild — minutes on
--      augment_stats_mv — during which every reader gets an error rather than
--      slightly stale numbers.
--   3. The aggregates are indexed on their group key only, so the clients
--      can't ask for one champion's rows without a sequential scan.
--
-- Plus two rollups the clients need: the Augments tab's grain (4k rows rather
-- than 341k) and the community page's matchup coverage.

-- ---------------------------------------------------------------------------
-- Indexes for the filters the clients actually send
--
-- A champion page asks for its own augment and item rows; an expanded augment
-- row asks for its own champions. Without these that is a scan of 341k rows
-- against a 3s statement timeout.
-- ---------------------------------------------------------------------------

create index if not exists augment_stats_mv_champion on public.augment_stats_mv (champion_id);
create index if not exists augment_stats_mv_augment on public.augment_stats_mv (augment_id);
create index if not exists item_stats_mv_champion on public.item_stats_mv (champion_id);
create index if not exists item_purchase_stats_mv_champion
  on public.item_purchase_stats_mv (champion_id);

-- ---------------------------------------------------------------------------
-- The Augments tab's grain: one row per augment per patch, rolled up across
-- champions. 4k rows instead of 341k, so the tab can hold all of it. The
-- per-champion grain stays a per-champion request from the champion page.
-- ---------------------------------------------------------------------------

drop materialized view if exists public.augment_totals_mv cascade;
create materialized view public.augment_totals_mv as
  select patch, queue_id, augment_id,
         sum(picks)::bigint as picks,
         sum(wins)::bigint as wins,
         sum(kills)::bigint as kills,
         sum(deaths)::bigint as deaths,
         sum(assists)::bigint as assists,
         sum(damage)::bigint as damage
    from public.augment_stats_mv
   group by patch, queue_id, augment_id;

create unique index augment_totals_mv_uq
  on public.augment_totals_mv (patch, queue_id, augment_id);

create or replace view public.augment_totals as select * from public.augment_totals_mv;

-- ---------------------------------------------------------------------------
-- How much of the champion-vs-champion matchup space the database has seen:
-- one row per unordered pair of champions that have faced each other, mirror
-- matchups included. A 3.4M-pair distinct over every participant, so it is
-- computed on the schedule with everything else rather than per page view.
-- ---------------------------------------------------------------------------

drop materialized view if exists public.matchup_coverage_mv cascade;
create materialized view public.matchup_coverage_mv as
  select count(*)::bigint as matchups,
         (select count(distinct champion_id) from public.match_participants)::bigint as champions
    from (select distinct
                 least(p1.champion_id, p2.champion_id) as a,
                 greatest(p1.champion_id, p2.champion_id) as b
            from public.match_participants p1
            join public.match_participants p2 on p2.platform = p1.platform
                                            and p2.game_id = p1.game_id
                                            and p2.team_id <> p1.team_id) pairs;

-- One row, but REFRESH CONCURRENTLY still wants a unique index
create unique index matchup_coverage_mv_uq on public.matchup_coverage_mv (matchups);

create or replace view public.matchup_coverage as select * from public.matchup_coverage_mv;

grant select on public.augment_totals to anon, authenticated, service_role;
grant select on public.matchup_coverage to anon, authenticated, service_role;

-- The views are owner-rights, so readers reach the aggregates through them.
-- Keeping the _mv tables out of the anon grant keeps the public API surface to
-- the four named views rather than eight near-duplicate endpoints.
revoke all on public.champion_stats_mv from anon, authenticated;
revoke all on public.augment_stats_mv from anon, authenticated;
revoke all on public.augment_totals_mv from anon, authenticated;
revoke all on public.item_stats_mv from anon, authenticated;
revoke all on public.item_purchase_stats_mv from anon, authenticated;
revoke all on public.matchup_coverage_mv from anon, authenticated;

analyze public.augment_totals_mv;
analyze public.matchup_coverage_mv;

-- ---------------------------------------------------------------------------
-- Refresh, concurrently and on a schedule
--
-- CONCURRENTLY is the point: a plain refresh holds an exclusive lock for the
-- whole rebuild, so readers would get errors instead of twenty-minute-old
-- numbers. It needs the unique index on each aggregate, which every one of
-- them has. Order matters — the two rollups read augment_stats_mv and the
-- participant tables, so they go last.
--
-- On a schedule rather than on ingest: an upload should not wait on a
-- five-million-row aggregate.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_stats() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Room for the augment aggregate to hash in memory instead of spilling to
  -- 64 disk partitions. Session-local; the instance default is untouched.
  set local work_mem = '256MB';
  refresh materialized view concurrently champion_stats_mv;
  refresh materialized view concurrently augment_stats_mv;
  refresh materialized view concurrently item_stats_mv;
  refresh materialized view concurrently item_purchase_stats_mv;
  refresh materialized view concurrently augment_totals_mv;
  refresh materialized view concurrently matchup_coverage_mv;
end;
$$;

revoke all on function public.refresh_stats() from public, anon, authenticated;

select cron.unschedule('refresh-community-stats')
  where exists (select 1 from cron.job where jobname = 'refresh-community-stats');

select cron.schedule('refresh-community-stats', '*/20 * * * *',
                     $$select public.refresh_stats()$$);
