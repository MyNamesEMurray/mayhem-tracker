-- Rate limiting by counter instead of by count.
--
-- Every ingest request ran up to three `count=exact` queries before doing any
-- work: lifetime contributions for the token, a 24h window, and pending
-- quarantine. They are indexed, but an exact count still visits every matching
-- row, so the check gets slower for a contributor with every game they
-- contribute. It is the hottest query in the system and it grows without
-- bound.
--
-- This holds the same three numbers as a single row per token, maintained by
-- the ingest transaction, so the check becomes one primary-key read.

create table if not exists public.contributor_stats (
  contributor_token uuid primary key,
  -- Lifetime accepted games, for the first-sync burst allowance
  lifetime_games    bigint      not null default 0,
  -- A rolling 24h window: the count and when the window opened. Reset lazily
  -- on read rather than by a sweep, so there is nothing scheduled to fail.
  window_started_at timestamptz not null default now(),
  window_games      integer     not null default 0,
  -- Unreviewed quarantined games, for the flood cap
  pending_quarantine integer    not null default 0,
  updated_at        timestamptz not null default now()
);

alter table public.contributor_stats enable row level security;

-- Backfill from what the counted tables already say, so the switch does not
-- hand every existing contributor a fresh burst allowance.
insert into public.contributor_stats (
  contributor_token, lifetime_games, window_started_at, window_games, pending_quarantine
)
select
  c.contributor_token,
  count(*)::bigint,
  now(),
  count(*) filter (where c.created_at >= now() - interval '24 hours')::int,
  coalesce(q.pending, 0)
from public.contributions c
left join (
  select contributor_token, count(*)::int as pending
    from public.quarantine
   where status = 'pending'
   group by contributor_token
) q on q.contributor_token = c.contributor_token
group by c.contributor_token, q.pending
on conflict (contributor_token) do nothing;

-- Quarantined games are counted here too, and a token can have quarantine rows
-- without any contributions, so those tokens need a row as well.
insert into public.contributor_stats (contributor_token, pending_quarantine)
select contributor_token, count(*)::int
  from public.quarantine
 where status = 'pending'
 group by contributor_token
on conflict (contributor_token) do nothing;

comment on table public.contributor_stats is
  'Per-token counters maintained by ingest_games(), replacing the count(*) rate checks.';
