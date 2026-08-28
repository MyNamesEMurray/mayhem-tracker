-- Superseded by stats.refresh_all() in 20260824120200, which discovers the
-- materialized views by catalog lookup instead of naming them. Kept because
-- it was applied, and the history should say what actually ran.
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
