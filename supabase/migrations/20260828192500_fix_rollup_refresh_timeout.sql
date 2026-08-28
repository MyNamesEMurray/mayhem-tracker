-- Why half the rollup refreshes have been failing.
--
-- The database's statement_timeout is two minutes and pg_cron inherits it.
-- stats.refresh_all() opened with
--
--   perform set_config('statement_timeout', '0', true);
--
-- which reads as handling that and does not. The timer for the statement
-- `select stats.refresh_all()` is armed when that statement starts; changing
-- the setting from inside the call that statement is already running does not
-- re-arm it. So a full pass has always had two minutes, whatever the function
-- said, and cron.job_run_details shows it timing out on roughly half its runs
-- for as far back as the history goes - "canceling statement due to statement
-- timeout", from inside a concurrent refresh.
--
-- The setting has to be its own statement, ahead of the call. pg_cron runs a
-- multi-statement command as one implicit transaction, so the SET below has
-- finished before the SELECT begins and the SELECT is armed with no timeout.
--
-- The second fix: a pass aborted on the first view that failed, leaving every
-- view after it stale until the next pass got further. They are independent,
-- so one slow or broken rollup should cost its own refresh and nobody else's.
-- Failures are collected and raised at the end instead, which keeps the job
-- reporting as failed and keeps the history saying which view it was.

create or replace function stats.refresh_all()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v        record;
  v_failed text[] := '{}';
begin
  if not pg_try_advisory_lock(hashtext('stats.refresh_all')) then
    raise notice 'stats.refresh_all() already running; skipping';
    return;
  end if;

  begin
    for v in select c.oid::regclass as rel, c.relispopulated
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'stats' and c.relkind = 'm'
              order by c.relname
    loop
      begin
        -- Concurrent once there is something to read; a view created WITH NO
        -- DATA has to be filled the blocking way first.
        if v.relispopulated then
          execute format('refresh materialized view concurrently %s', v.rel);
        else
          execute format('refresh materialized view %s', v.rel);
        end if;
      exception when others then
        v_failed := v_failed || (v.rel::text || ' (' || sqlerrm || ')');
      end;
    end loop;
  exception when others then
    perform pg_advisory_unlock(hashtext('stats.refresh_all'));
    raise;
  end;

  perform pg_advisory_unlock(hashtext('stats.refresh_all'));

  if array_length(v_failed, 1) > 0 then
    raise exception 'stats.refresh_all: % of % rollups failed: %',
      array_length(v_failed, 1),
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'stats' and c.relkind = 'm'),
      array_to_string(v_failed, '; ');
  end if;
end;
$function$;

revoke all on function stats.refresh_all() from public, anon, authenticated;

-- Re-point the schedule at a command that lifts the timeout first. Half an
-- hour still leaves room: a pass over eight rollups is minutes, not tens of
-- them, and one that overruns its slot is skipped rather than stacked by the
-- advisory lock above.
select cron.unschedule('refresh-stats-rollups');
select cron.schedule(
  'refresh-stats-rollups',
  '*/30 * * * *',
  $$set statement_timeout = 0; select stats.refresh_all();$$
);
