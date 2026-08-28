-- Quarantine-and-review pipeline: implausible (but structurally valid) games
-- are held for manual review instead of hard-rejected. A cron builds a digest
-- email at most every 6 hours; approve/deny links resolve through the
-- `review` edge function.
--
-- ---------------------------------------------------------------------------
-- RECOVERED WITH SECRETS REMOVED. Read this before running it anywhere.
--
-- As applied to production, this migration seeded public.admin_config with
-- live values inline: the review secret that authorises approve and deny
-- links, the cron secret that authorises the digest call, an API key, and a
-- personal email address. Those values are still in the project's own
-- migration history, and they are deliberately NOT reproduced here, because
-- this file is committed to git.
--
-- The consequence for anyone rebuilding: this migration creates admin_config
-- empty. Seed it out of band, from a password manager or the dashboard, with
-- values generated for that environment:
--
--   insert into public.admin_config (key, value) values
--     ('review_secret',  '<generate a fresh one>'),
--     ('cron_secret',    '<generate a fresh one>'),
--     ('notify_email',   '<where digests should go>'),
--     ('digest_from',    '<verified sender>'),
--     ('resend_api_key', '<from Resend>'),
--     ('anon_key',       '<this project''s anon key>');
--
-- invoke_quarantine_digest() returns quietly when the secrets are absent, so
-- an unseeded environment simply never sends a digest rather than erroring
-- every six hours.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.quarantine (
  id uuid primary key default gen_random_uuid(),
  contributor_token uuid not null,
  platform text not null,
  game_id bigint not null,
  payload jsonb not null,
  reasons text[] not null,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  reviewed_at timestamptz,
  unique (contributor_token, platform, game_id)
);
create index quarantine_pending_idx on public.quarantine (status, notified_at) where status = 'pending';

-- Service-role only: RLS on with no policies
alter table public.quarantine enable row level security;

-- Key/value store for review + cron secrets and email config.
-- Service-role only (RLS on, no policies), never exposed to anon.
create table public.admin_config (
  key text primary key,
  value text not null
);
alter table public.admin_config enable row level security;

-- Cron entry point: reads secrets at call time so nothing sensitive lives in
-- the cron job's stored command. Definer runs as postgres, which can read
-- admin_config through RLS; execute is revoked from client roles.
create or replace function public.invoke_quarantine_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cron text;
  v_anon text;
begin
  select value into v_cron from public.admin_config where key = 'cron_secret';
  select value into v_anon from public.admin_config where key = 'anon_key';
  if v_cron is null or v_anon is null then
    return;
  end if;
  -- The project URL is hardcoded, which is how this is deployed. A rebuilt
  -- environment on a different project ref has to edit it here. Left as-is
  -- rather than parameterised, because recovering a schema is not the moment
  -- to change a function that works.
  perform net.http_post(
    url := 'https://lmzenzxbhotszvwsnhlm.supabase.co/functions/v1/quarantine-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('cronSecret', v_cron),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.invoke_quarantine_digest() from public;
revoke all on function public.invoke_quarantine_digest() from anon;
revoke all on function public.invoke_quarantine_digest() from authenticated;

-- One digest at most every 6 hours
select cron.schedule('quarantine-digest-6h', '0 */6 * * *', 'select public.invoke_quarantine_digest()');
