-- Anonymous community match data for Mayhem Tracker.
-- No player identity is stored anywhere in this schema: uploads carry
-- champion/augment/item/stat lines only, keyed by (platform, game_id).

create table public.matches (
  platform      text        not null,
  game_id       bigint      not null,
  queue_id      integer     not null,
  game_version  text        not null,
  game_duration integer     not null,
  game_creation bigint      not null,
  created_at    timestamptz not null default now(),
  primary key (platform, game_id)
);

create table public.match_participants (
  platform              text     not null,
  game_id               bigint   not null,
  participant_id        smallint not null,
  team_id               smallint not null,
  champion_id           integer  not null,
  win                   boolean  not null,
  kills                 smallint not null,
  deaths                smallint not null,
  assists               smallint not null,
  double_kills          smallint not null,
  triple_kills          smallint not null,
  quadra_kills          smallint not null,
  penta_kills           smallint not null,
  largest_killing_spree smallint not null,
  total_damage_dealt    integer  not null,
  total_damage_taken    integer  not null,
  gold_earned           integer  not null,
  total_heal            integer  not null,
  item0 integer, item1 integer, item2 integer, item3 integer,
  item4 integer, item5 integer, item6 integer,
  primary key (platform, game_id, participant_id),
  foreign key (platform, game_id) references public.matches (platform, game_id) on delete cascade
);
create index idx_match_participants_champion on public.match_participants (champion_id);

-- champion_id and win are denormalized so augment aggregates never join the
-- wider participants table (mirrors the desktop app's local schema).
create table public.match_participant_augments (
  platform       text     not null,
  game_id        bigint   not null,
  participant_id smallint not null,
  slot           smallint not null,
  augment_id     integer  not null,
  champion_id    integer  not null,
  win            boolean  not null,
  primary key (platform, game_id, participant_id, slot),
  foreign key (platform, game_id, participant_id)
    references public.match_participants (platform, game_id, participant_id) on delete cascade
);
create index idx_match_participant_augments_augment on public.match_participant_augments (augment_id);

-- Which anonymous contributor token uploaded which game, for rate limiting
-- and "delete everything I uploaded". Tokens are random client-generated
-- UUIDs with no link to any account or player identity.
create table public.contributions (
  contributor_token uuid        not null,
  platform          text        not null,
  game_id           bigint      not null,
  created_at        timestamptz not null default now(),
  primary key (contributor_token, platform, game_id),
  foreign key (platform, game_id) references public.matches (platform, game_id) on delete cascade
);
create index idx_contributions_token_time on public.contributions (contributor_token, created_at);

-- Lock all tables down; only the service-role ingest function writes, and
-- public reads go through the aggregate views below.
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_participant_augments enable row level security;
alter table public.contributions enable row level security;
revoke all on public.matches, public.match_participants,
           public.match_participant_augments, public.contributions
  from anon, authenticated;

-- Aggregate-only views for the public website: no per-game or per-player
-- rows are ever exposed, only counts grouped by patch/queue/champion/augment.
create view public.champion_stats as
  select m.game_version as patch, m.queue_id, p.champion_id,
         count(*)::bigint as games,
         (count(*) filter (where p.win))::bigint as wins
  from public.match_participants p
  join public.matches m on m.platform = p.platform and m.game_id = p.game_id
  group by m.game_version, m.queue_id, p.champion_id;

create view public.augment_stats as
  select m.game_version as patch, m.queue_id, a.augment_id, a.champion_id,
         count(*)::bigint as picks,
         (count(*) filter (where a.win))::bigint as wins
  from public.match_participant_augments a
  join public.matches m on m.platform = a.platform and m.game_id = a.game_id
  group by m.game_version, m.queue_id, a.augment_id, a.champion_id;

grant select on public.champion_stats, public.augment_stats to anon, authenticated;

-- Removes a contributor's records. Matches nobody else contributed are
-- deleted entirely (cascading to participants and augments); returns how
-- many matches were removed.
create function public.delete_contributions(p_token uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.matches m
  where exists (
    select 1 from public.contributions c
    where c.platform = m.platform and c.game_id = m.game_id
      and c.contributor_token = p_token
  )
  and not exists (
    select 1 from public.contributions c2
    where c2.platform = m.platform and c2.game_id = m.game_id
      and c2.contributor_token <> p_token
  );
  get diagnostics removed = row_count;
  delete from public.contributions where contributor_token = p_token;
  return removed;
end;
$$;

revoke execute on function public.delete_contributions(uuid) from public, anon, authenticated;
grant execute on function public.delete_contributions(uuid) to service_role;
