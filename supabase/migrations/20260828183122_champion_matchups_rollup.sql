-- Who beats whom.
--
-- Every cross-team pairing in every game with a known winner has been in
-- match_participants since the first upload, and nothing read it except
-- stats.matchup_coverage, which counted how many distinct pairs existed for a
-- single tile on the community page. That count cost a self-join over 1.37M
-- participant rows every half hour and answered one number.
--
-- This is the same join, kept. One row per champion per opponent per patch
-- per queue, with wins from that champion's side, and both directions stored
-- so reading a champion's matchups is one filter rather than a union of two.
--
-- The coverage tile then becomes a count over this instead of the self-join
-- again, so the expensive part happens once and pays for a feature rather
-- than for a number.

create materialized view stats.champion_matchups as
select m.game_version                         as patch,
       m.queue_id,
       p1.champion_id,
       p2.champion_id                         as opponent_id,
       count(*)::bigint                       as games,
       count(*) filter (where p1.win)::bigint as wins
  from public.match_participants p1
  join public.match_participants p2
    on p2.platform = p1.platform
   and p2.game_id  = p1.game_id
   and p2.team_id <> p1.team_id
  join public.matches m
    on m.platform = p1.platform
   and m.game_id  = p1.game_id
 group by 1, 2, 3, 4;

-- refresh_all() refreshes concurrently, which requires a unique index. This
-- is also the order the API pages on: every page after the first goes out in
-- parallel, so the view has to hand rows back in a fixed order or a page can
-- repeat another's rows and drop the difference.
create unique index champion_matchups_key
  on stats.champion_matchups (patch, queue_id, champion_id, opponent_id);

-- The read the site and the app actually make: one champion, some patches.
-- The unique index leads with patch, so it cannot serve this.
create index champion_matchups_by_champion
  on stats.champion_matchups (champion_id, patch, queue_id);

-- The public surface, matching the other rollups: owned by postgres, not
-- security_invoker, so anon can read the aggregate without any grant on the
-- row-level-secured tables underneath.
create view public.champion_matchups as select * from stats.champion_matchups;
grant select on public.champion_matchups to anon, authenticated, service_role;

-- Coverage, rebuilt on the rollup. Same two numbers, same meaning: distinct
-- unordered pairs, and how many champions have been seen at all. A champion
-- in any game has five opponents, so counting them here is counting them in
-- match_participants.
drop view if exists public.matchup_coverage;
drop materialized view if exists stats.matchup_coverage;

create materialized view stats.matchup_coverage as
select (select count(*)
          from (select distinct least(champion_id, opponent_id)    as a,
                                greatest(champion_id, opponent_id) as b
                  from stats.champion_matchups) pairs)::bigint as matchups,
       (select count(distinct champion_id)
          from stats.champion_matchups)::bigint                as champions;

-- One row, but concurrent refresh still wants a unique index
create unique index matchup_coverage_key on stats.matchup_coverage (matchups, champions);

create view public.matchup_coverage as select * from stats.matchup_coverage;
grant select on public.matchup_coverage to anon, authenticated, service_role;

-- Measured against 137,317 games on the day this was applied: the rollup is
-- 491,730 rows and 55 MB, rebuilds concurrently in 18.7s, and coverage - the
-- one number this join used to be built for - went from 6.1s to 0.3s.
-- stats.refresh_all() picks both up by catalog lookup, and refreshes in name
-- order, so champion_matchups is rebuilt before the coverage that reads it.
