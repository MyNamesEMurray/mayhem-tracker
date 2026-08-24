-- Duplicate rollups from a parallel attempt at the same fix. The public views
-- read stats.* instead, and nothing refreshed these, so they were a frozen
-- ~72MB copy of the same aggregates. No CASCADE: if anything turns out to
-- depend on them, this should fail rather than take that with it.
drop materialized view public.champion_stats_mv;
drop materialized view public.augment_stats_mv;
drop materialized view public.item_stats_mv;
drop materialized view public.item_purchase_stats_mv;
drop function public.refresh_stats();
