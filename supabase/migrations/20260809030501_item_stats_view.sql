-- Aggregate item stats per champion: unpivot the seven item slots into rows
-- grouped by patch/queue/champion/item. Same aggregate-only posture as the
-- other views. Poro-Snax (2052, 220013) is handed out for free and would
-- show a meaningless ~100% pick rate, so it's excluded, mirroring the
-- desktop app's local item stats.

create view public.item_stats as
  select m.game_version as patch, m.queue_id, p.champion_id, i.item_id,
         count(*)::bigint as picks,
         (count(*) filter (where p.win))::bigint as wins
  from public.match_participants p
  join public.matches m on m.platform = p.platform and m.game_id = p.game_id
  cross join lateral (
    values (p.item0), (p.item1), (p.item2), (p.item3), (p.item4), (p.item5), (p.item6)
  ) as i(item_id)
  where i.item_id is not null
    and i.item_id > 0
    and i.item_id not in (2052, 220013)
  group by m.game_version, m.queue_id, p.champion_id, i.item_id;

grant select on public.item_stats to anon, authenticated;
