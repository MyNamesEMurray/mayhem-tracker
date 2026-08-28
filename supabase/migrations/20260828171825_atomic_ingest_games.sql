-- One transaction for a batch of games.
--
-- The ingest edge function wrote five tables as five separate PostgREST calls
-- with nothing around them. A failure after the first left a match row with no
-- participants: counted in every total, contributing nothing, and never
-- retried, because the client had already been told the game was accepted and
-- a later upsert hits ON CONFLICT DO NOTHING. Rare at low traffic; concurrency
-- is exactly what makes connection exhaustion, statement timeouts and lock
-- contention common, and any of them can land between two of those calls.
--
-- Validation stays in the edge function, which does it well and in a language
-- suited to it. This takes the rows that validation produced and commits them
-- as a unit, and maintains the rate-limit counters in the same transaction so
-- they cannot drift from what was actually written.
--
-- Service role only. It trusts its caller.

create or replace function public.ingest_games(
  p_token   uuid,
  p_payload jsonb,
  -- Kept as arguments rather than baked in so the edge function stays the one
  -- place the limits are stated
  p_burst_lifetime    integer default 800,
  p_daily_steady      integer default 60,
  p_max_pending_quarantine integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stats           public.contributor_stats%rowtype;
  v_new_games       integer;
  v_quarantine_room integer;
  v_quarantine      jsonb;
  v_deferred        jsonb := '[]'::jsonb;
  v_inserted        integer;
  v_quarantined_now integer := 0;
begin
  v_new_games := coalesce(jsonb_array_length(p_payload->'matches'), 0)
               + coalesce(jsonb_array_length(p_payload->'quarantine'), 0);

  if v_new_games = 0 then
    return jsonb_build_object('accepted', 0, 'quarantined', 0, 'deferred', '[]'::jsonb);
  end if;

  -- Serialises concurrent uploads from one token, so two clients sharing a
  -- contributor id cannot both pass a check the pair of them exceeds.
  insert into public.contributor_stats (contributor_token)
       values (p_token)
  on conflict (contributor_token) do nothing;

  select * into v_stats
    from public.contributor_stats
   where contributor_token = p_token
     for update;

  -- Roll the window lazily. Nothing is scheduled to do this, so there is
  -- nothing scheduled to fail.
  if v_stats.window_started_at < now() - interval '24 hours' then
    v_stats.window_started_at := now();
    v_stats.window_games := 0;
  end if;

  -- A first sync flows freely; after that, a humanly playable daily volume.
  if v_stats.lifetime_games + v_new_games > p_burst_lifetime
     and v_stats.window_games + v_new_games > p_daily_steady then
    return jsonb_build_object(
      'error', 'daily contribution limit reached, try again tomorrow',
      'rate_limited', true
    );
  end if;

  -- The writes. Any failure below rolls back all of them.
  insert into public.matches (
    platform, game_id, queue_id, game_version, game_duration, game_creation
  )
  select m->>'platform', (m->>'game_id')::bigint, (m->>'queue_id')::integer,
         m->>'game_version', (m->>'game_duration')::integer, (m->>'game_creation')::bigint
    from jsonb_array_elements(coalesce(p_payload->'matches', '[]'::jsonb)) m
  on conflict (platform, game_id) do nothing;

  insert into public.match_participants (
    platform, game_id, participant_id, team_id, champion_id, win,
    kills, deaths, assists, double_kills, triple_kills, quadra_kills, penta_kills,
    largest_killing_spree, total_damage_dealt, total_damage_taken, gold_earned, total_heal,
    item0, item1, item2, item3, item4, item5, item6
  )
  select p->>'platform', (p->>'game_id')::bigint, (p->>'participant_id')::smallint,
         (p->>'team_id')::smallint, (p->>'champion_id')::integer, (p->>'win')::boolean,
         (p->>'kills')::smallint, (p->>'deaths')::smallint, (p->>'assists')::smallint,
         (p->>'double_kills')::smallint, (p->>'triple_kills')::smallint,
         (p->>'quadra_kills')::smallint, (p->>'penta_kills')::smallint,
         (p->>'largest_killing_spree')::smallint, (p->>'total_damage_dealt')::integer,
         (p->>'total_damage_taken')::integer, (p->>'gold_earned')::integer,
         (p->>'total_heal')::integer,
         nullif(p->>'item0','')::integer, nullif(p->>'item1','')::integer,
         nullif(p->>'item2','')::integer, nullif(p->>'item3','')::integer,
         nullif(p->>'item4','')::integer, nullif(p->>'item5','')::integer,
         nullif(p->>'item6','')::integer
    from jsonb_array_elements(coalesce(p_payload->'participants', '[]'::jsonb)) p
  on conflict (platform, game_id, participant_id) do nothing;

  insert into public.match_participant_augments (
    platform, game_id, participant_id, slot, augment_id, champion_id, win
  )
  select a->>'platform', (a->>'game_id')::bigint, (a->>'participant_id')::smallint,
         (a->>'slot')::smallint, (a->>'augment_id')::integer,
         (a->>'champion_id')::integer, (a->>'win')::boolean
    from jsonb_array_elements(coalesce(p_payload->'augments', '[]'::jsonb)) a
  on conflict (platform, game_id, participant_id, slot) do nothing;

  insert into public.match_item_events (
    platform, game_id, participant_id, seq, game_time, action, item_id, count
  )
  select e->>'platform', (e->>'game_id')::bigint, (e->>'participant_id')::integer,
         (e->>'seq')::integer, (e->>'game_time')::integer, e->>'action',
         (e->>'item_id')::integer, (e->>'count')::integer
    from jsonb_array_elements(coalesce(p_payload->'item_events', '[]'::jsonb)) e
  on conflict (platform, game_id, participant_id, seq) do nothing;

  -- Quarantine, honouring the flood cap
  v_quarantine := coalesce(p_payload->'quarantine', '[]'::jsonb);
  v_quarantine_room := greatest(p_max_pending_quarantine - v_stats.pending_quarantine, 0);

  if jsonb_array_length(v_quarantine) > v_quarantine_room then
    -- Report the overflow so the client is told rather than silently ignored
    select coalesce(jsonb_agg(q->'game_id'), '[]'::jsonb) into v_deferred
      from jsonb_array_elements(v_quarantine) with ordinality t(q, i)
     where i > v_quarantine_room;

    select coalesce(jsonb_agg(q), '[]'::jsonb) into v_quarantine
      from jsonb_array_elements(v_quarantine) with ordinality t(q, i)
     where i <= v_quarantine_room;
  end if;

  insert into public.quarantine (contributor_token, platform, game_id, payload, reasons)
  select p_token, q->>'platform', (q->>'game_id')::bigint, q->'payload',
         array(select jsonb_array_elements_text(q->'reasons'))
    from jsonb_array_elements(v_quarantine) q
  on conflict (contributor_token, platform, game_id) do nothing;
  get diagnostics v_quarantined_now = row_count;

  -- Attribution, and the counters that match it
  insert into public.contributions (contributor_token, platform, game_id)
  select p_token, c->>'platform', (c->>'game_id')::bigint
    from jsonb_array_elements(coalesce(p_payload->'contributions', '[]'::jsonb)) c
  on conflict (contributor_token, platform, game_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- Counted on what was actually written, so a re-uploaded batch does not
  -- spend an allowance on games already contributed.
  update public.contributor_stats
     set lifetime_games     = lifetime_games + v_inserted + v_quarantined_now,
         window_started_at  = v_stats.window_started_at,
         window_games       = case
                                when v_stats.window_started_at > window_started_at then 0
                                else window_games
                              end,
         updated_at         = now()
   where contributor_token = p_token;

  update public.contributor_stats
     set window_games       = v_stats.window_games + v_inserted + v_quarantined_now,
         pending_quarantine = pending_quarantine + v_quarantined_now
   where contributor_token = p_token;

  return jsonb_build_object(
    'accepted', v_inserted,
    'quarantined', v_quarantined_now,
    'deferred', v_deferred
  );
end;
$function$;

revoke all on function public.ingest_games(uuid, jsonb, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ingest_games(uuid, jsonb, integer, integer, integer) to service_role;
