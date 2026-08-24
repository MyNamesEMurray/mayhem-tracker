-- Two rollups the clients read that the stats schema doesn't have yet.
--
-- This replaces an earlier draft of this migration that also set up a refresh
-- schedule and moved the aggregates out of public. Both of those have since
-- been done properly in the database: the aggregates live in stats, and
-- stats.refresh_all() runs every 30 minutes behind an advisory lock, refreshing
-- CONCURRENTLY where it can. That function discovers every materialized view in
-- the stats schema by catalog lookup rather than by name, so the two added here
-- are picked up by the existing schedule with no change to it. Nothing below
-- touches the refresh path.
--
-- Both views follow the pattern already in place: a materialized view in stats,
-- read through an owner-rights view in public, so PostgREST exposes one named
-- endpoint per aggregate and the stats schema stays unexposed.

-- ---------------------------------------------------------------------------
-- The Augments tab's grain: one row per augment per patch, rolled up across
-- champions — 4k rows rather than the 341k of stats.augment_stats. The site
-- loads this whole view for the tier list; the per-champion grain stays a
-- per-champion request from the champion page.
--
-- Without it the Augments tab is blank: the site asks for augment_totals and
-- gets a 404.
-- ---------------------------------------------------------------------------

drop materialized view if exists stats.augment_totals cascade;
create materialized view stats.augment_totals as
  select patch, queue_id, augment_id,
         sum(picks)::bigint as picks,
         sum(wins)::bigint as wins,
         sum(kills)::bigint as kills,
         sum(deaths)::bigint as deaths,
         sum(assists)::bigint as assists,
         sum(damage)::bigint as damage
    from stats.augment_stats
   group by patch, queue_id, augment_id;

-- Unique on the group key, which is what lets refresh_all() rebuild this
-- CONCURRENTLY instead of locking readers out. matches.game_version is NOT
-- NULL, so a plain unique index is enough.
create unique index augment_totals_key
  on stats.augment_totals (patch, queue_id, augment_id);

create or replace view public.augment_totals as select * from stats.augment_totals;
grant select on public.augment_totals to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- How much of the champion-vs-champion matchup space the database has seen:
-- one row per unordered pair of champions that have faced each other, mirror
-- matchups included. The community page's fourth tile.
--
-- A distinct over ~3.4M pairs, so it belongs on the refresh schedule rather
-- than in a page view. Expect this one to take a minute or two to build.
-- ---------------------------------------------------------------------------

drop materialized view if exists stats.matchup_coverage cascade;
create materialized view stats.matchup_coverage as
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
create unique index matchup_coverage_key on stats.matchup_coverage (matchups);

create or replace view public.matchup_coverage as select * from stats.matchup_coverage;
grant select on public.matchup_coverage to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Indexes for the per-champion filters, which is what a champion page sends.
--
-- Not urgent: the existing group-key indexes already lead with patch, and
-- Postgres scans one of those for a bare champion_id filter — measured at 24ms
-- for 2,533 augment rows and 14ms for 1,416 item rows, nowhere near the 3s
-- statement timeout. These make it an ordinary index lookup instead, which
-- matters more as the item grain grows past its current 240k rows.
-- ---------------------------------------------------------------------------

create index if not exists augment_stats_champion on stats.augment_stats (champion_id);
create index if not exists augment_stats_augment on stats.augment_stats (augment_id);
create index if not exists item_stats_champion on stats.item_stats (champion_id);
create index if not exists item_purchase_stats_champion
  on stats.item_purchase_stats (champion_id);

analyze stats.augment_totals;
analyze stats.matchup_coverage;
