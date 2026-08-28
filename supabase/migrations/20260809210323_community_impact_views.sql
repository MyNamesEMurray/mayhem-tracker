-- Aggregate-only views for the public "community impact" page: how many
-- games, contributors, and hours the crowdsourced database represents.
-- Counts only, no tokens or identities are exposed.

create or replace view public.community_totals as
select
  (select count(*) from public.matches) as games,
  (select count(distinct contributor_token) from public.contributions) as contributors,
  (select coalesce(sum(game_duration), 0) from public.matches) as total_seconds,
  (select count(distinct split_part(game_version, '.', 1) || '.' || split_part(game_version, '.', 2)) from public.matches) as patches,
  (select min(game_creation) from public.matches) as first_game_ms,
  (select max(game_creation) from public.matches) as last_game_ms;

create or replace view public.community_games_per_day as
select
  (to_timestamp(game_creation / 1000))::date as day,
  count(*)::int as games
from public.matches
group by 1
order by 1;

grant select on public.community_totals to anon;
grant select on public.community_games_per_day to anon;
