-- Repoint the public API surface at the rollups from 20260824120000 and put
-- their rebuild on a schedule. Column names, types and ordering are unchanged,
-- so the website, the prerender script and the desktop app all keep working
-- against the same view names - they just stop paying for the aggregation.
--
-- Apply this only once stats.refresh_all() has populated the rollups, or the
-- views will read as empty until the first refresh lands.

drop view if exists public.champion_stats;
drop view if exists public.augment_stats;
drop view if exists public.item_stats;
drop view if exists public.item_purchase_stats;

create view public.champion_stats as select * from stats.champion_stats;
create view public.augment_stats as select * from stats.augment_stats;
create view public.item_stats as select * from stats.item_stats;
create view public.item_purchase_stats as select * from stats.item_purchase_stats;

-- The rollups live in a schema PostgREST does not expose, so these views are
-- the only way in, exactly as before. They are owned by postgres and are not
-- security_invoker, which is what lets anon read aggregates without any grant
-- on the row-level-secured tables underneath.
grant select on public.champion_stats to anon, authenticated, service_role;
grant select on public.augment_stats to anon, authenticated, service_role;
grant select on public.item_stats to anon, authenticated, service_role;
grant select on public.item_purchase_stats to anon, authenticated, service_role;

-- Community stats stay live views over matches/contributions: they read a
-- couple of hundred milliseconds and contributors watch the game count tick up.

-- A full pass rebuilds all four rollups in about two minutes, so every half
-- hour keeps the load light while the numbers stay current enough for stats
-- that are read a patch at a time. A pass that overruns its slot is skipped
-- rather than stacked, by the advisory lock in stats.refresh_all().
select cron.schedule(
  'refresh-stats-rollups',
  '*/30 * * * *',
  $$select stats.refresh_all()$$
);
