-- Build-order events uploaded with games (captured live by the desktop
-- app): item add/remove per participant with in-game timestamps. Locked
-- like the other raw tables; served to the site only through the
-- aggregate view below.

create table public.match_item_events (
  platform text not null,
  game_id bigint not null,
  participant_id int not null,
  seq int not null,
  game_time int not null,
  action text not null check (action in ('add','remove')),
  item_id int not null,
  count int not null default 1,
  primary key (platform, game_id, participant_id, seq)
);
alter table public.match_item_events enable row level security;

-- Per champion+item: how many participants bought it and how early on
-- average. Sorting popular items by avg first-buy time yields the
-- typical build path.
create view public.item_purchase_stats as
select
  m.game_version as patch,
  m.queue_id,
  p.champion_id,
  f.item_id,
  count(*) as picks,
  count(*) filter (where p.win) as wins,
  round(avg(f.first_buy_s))::int as avg_first_buy_s
from (
  select platform, game_id, participant_id, item_id, min(game_time) as first_buy_s
  from public.match_item_events
  where action = 'add'
  group by platform, game_id, participant_id, item_id
) f
join public.match_participants p using (platform, game_id, participant_id)
join public.matches m using (platform, game_id)
group by m.game_version, m.queue_id, p.champion_id, f.item_id;

grant select on public.item_purchase_stats to anon;
