-- public.refresh_stats() - a SECURITY DEFINER maintenance function left over
-- from a parallel attempt at this fix (public.*_mv) - was reachable as
-- /rest/v1/rpc/refresh_stats with the public anon key, so anyone could kick
-- off a full rollup rebuild, over and over. Nothing calls it over the API:
-- no cron job, no edge function. Take the API grants away and leave it to
-- postgres/service_role.
revoke execute on function public.refresh_stats() from public, anon, authenticated;
