// Anonymous community match ingest for Mayhem Tracker.
//
// Accepts batches of games from the desktop app's opt-in upload. Payloads
// contain no player identity (no puuids, names, tags, or icons) and none is
// accepted: every field is schema-validated and unknown fields are dropped by
// construction. Games are deduplicated on (platform, game_id) so two players
// from the same lobby can both contribute without double-counting.
//
// Integrity model: structural impossibilities (wrong team counts, multikill
// hierarchy violations, pre-Mayhem dates) are hard-rejected. Games that are
// structurally valid but exceed duration-scaled plausibility ceilings are
// QUARANTINED for manual review instead of rejected: they're stored in the
// quarantine table, excluded from stats, and surfaced in a batched digest
// email (at most one every 6 hours) linking to the review queue. The uploader
// sees them as accepted so legitimate outlier games aren't retried or
// punished. Rate shaping: a first-sync burst allowance followed by a
// humanly-playable steady-state daily cap.
//
// Participants may carry optional itemEvents (build order captured live by
// the app): bounded lists of timestamped item add/remove rows feeding the
// item_purchase_stats view. Duplicate uploads of the same game collide on
// the (platform, game_id, participant_id, seq) key and are ignored.
import { createClient } from "npm:@supabase/supabase-js@2";

const MAYHEM_QUEUES = [2400, 2450];
const MAX_GAMES_PER_REQUEST = 50;
// A token's first ~800 games flow freely (initial history backfill); after
// that it is capped at a humanly-playable daily volume.
const BURST_LIFETIME = 800;
const MAX_GAMES_PER_DAY_STEADY = 60;
// Cap on unreviewed quarantined games per token - bounds both digest email
// size and quarantine-flooding abuse.
const MAX_PENDING_QUARANTINE = 25;
// ARAM Mayhem didn't exist before 2025 - nothing older can be real
const MIN_GAME_CREATION = 1735689600000;
// Build-order bounds: no real participant buys/sells this much
const MAX_ITEM_EVENTS_PER_PARTICIPANT = 120;
const MAX_ITEM_EVENTS_PER_GAME = 800;

// Per-second ceilings for the plausibility check, set from the distribution
// they're meant to sit above rather than from what ARAM looks like. Mayhem's
// augments routinely multiply tanking, sustain and burst several times over,
// and the first limits here were tuned before there was data to tune against:
// they flagged 0.53% of games - one in every two hundred - which is a queue
// nobody works, not an exception report.
//
// Measured over 136k games / 1.37M participants, per second of game time:
//
//                    p99    p99.9   p99.99   ceiling
//   damage taken     112     176      267      400
//   damage dealt      87     128      192      300
//   healing           48      86      148      300
//   gold (over 3000)  17      20       24       45
//
// That's 27 games flagged out of 136k (0.02%). A fabricated game has to stay
// inside the top hundredth of a percent of real values to pass, and the
// structural checks below - 5v5, one winner, multikill hierarchy, spree
// within kills - are what actually make fabrication hard.
const MAX_DAMAGE_TAKEN_PER_S = 400;
const MAX_DAMAGE_DEALT_PER_S = 300;
const MAX_HEAL_PER_S = 300;
const GOLD_BASE = 3000;
const MAX_GOLD_PER_S = 45;
// Seconds per kill/death at the ceiling. Kills was one per 15s, and the
// busiest real game measured came within 5% of tripping it.
const MIN_SECONDS_PER_KILL = 12;
const MIN_SECONDS_PER_DEATH = 15;
const MIN_SECONDS_PER_ASSIST = 6;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORM_RE = /^[A-Z0-9]{2,8}$/;
const PATCH_RE = /^\d{1,3}\.\d{1,3}$/;

// Uploads may carry client build versions ("16.16"); we store Riot's
// year-based patch names ("26.16"). Client majors stay below 25 until 2035,
// so the shift is idempotent.
function toYearPatch(patch: string): string {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${m[2]}` : patch;
}

const COUNT_FIELDS = [
  "kills",
  "deaths",
  "assists",
  "doubleKills",
  "tripleKills",
  "quadraKills",
  "pentaKills",
  "largestKillingSpree",
] as const;
const TOTAL_FIELDS = ["totalDamageDealt", "totalDamageTaken", "goldEarned", "totalHeal"] as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

// Structural validation: shapes and invariants no real game can violate.
// A non-null return is a hard rejection.
function validateStructural(g: any): string | null {
  if (!g || typeof g !== "object") return "not an object";
  if (typeof g.platform !== "string" || !PLATFORM_RE.test(g.platform)) return "bad platform";
  if (!isInt(g.gameId, 1, 1e15)) return "bad gameId";
  if (!MAYHEM_QUEUES.includes(g.queueId)) return "not a Mayhem queue";
  if (typeof g.gameVersion !== "string" || !PATCH_RE.test(g.gameVersion)) return "bad gameVersion";
  if (!isInt(g.gameDuration, 300, 7200)) return "bad gameDuration";
  if (!isInt(g.gameCreation, MIN_GAME_CREATION, Date.now() + 3_600_000)) return "bad gameCreation";

  const ps = g.participants;
  if (!Array.isArray(ps) || ps.length !== 10) return "must have exactly 10 participants";
  const ids = new Set<number>();
  const teamWin = new Map<number, boolean>();
  const teamCount = new Map<number, number>();
  let totalItemEvents = 0;
  for (const p of ps) {
    if (!p || typeof p !== "object") return "bad participant";
    if (!isInt(p.participantId, 1, 10) || ids.has(p.participantId)) return "bad participantId";
    ids.add(p.participantId);
    if (p.teamId !== 100 && p.teamId !== 200) return "bad teamId";
    if (!isInt(p.championId, 1, 5000)) return "bad championId";
    if (typeof p.win !== "boolean") return "bad win";
    for (const f of COUNT_FIELDS) {
      if (!isInt(p[f], 0, 500)) return `bad ${f}`;
    }
    for (const f of TOTAL_FIELDS) {
      if (!isInt(p[f], 0, 10_000_000)) return `bad ${f}`;
    }
    // Multikill thresholds are cumulative: every triple was also a double, etc.
    if (p.tripleKills > p.doubleKills) return "multikill hierarchy violated";
    if (p.quadraKills > p.tripleKills) return "multikill hierarchy violated";
    if (p.pentaKills > p.quadraKills) return "multikill hierarchy violated";
    if (p.doubleKills > p.kills) return "more multikills than kills";
    if (p.largestKillingSpree > p.kills) return "spree exceeds kills";
    if (!Array.isArray(p.items) || p.items.length !== 7) return "bad items";
    for (const it of p.items) {
      if (it !== null && !isInt(it, 0, 1_000_000)) return "bad item id";
    }
    if (!Array.isArray(p.augments) || p.augments.length > 6) return "bad augments";
    const slots = new Set<number>();
    for (const a of p.augments) {
      if (!a || typeof a !== "object") return "bad augment";
      if (!isInt(a.slot, 1, 6) || slots.has(a.slot)) return "bad augment slot";
      slots.add(a.slot);
      if (!isInt(a.augmentId, 1, 1_000_000)) return "bad augmentId";
    }
    if (p.itemEvents !== undefined) {
      if (!Array.isArray(p.itemEvents) || p.itemEvents.length > MAX_ITEM_EVENTS_PER_PARTICIPANT) {
        return "bad itemEvents";
      }
      totalItemEvents += p.itemEvents.length;
      for (const e of p.itemEvents) {
        if (!e || typeof e !== "object") return "bad item event";
        if (!isInt(e.gameTime, 0, g.gameDuration + 120)) return "bad item event time";
        if (e.action !== "add" && e.action !== "remove") return "bad item event action";
        if (!isInt(e.itemId, 1, 1_000_000)) return "bad item event id";
        if (!isInt(e.count, 1, 10)) return "bad item event count";
      }
    }
    if (teamWin.has(p.teamId) && teamWin.get(p.teamId) !== p.win) return "inconsistent team win";
    teamWin.set(p.teamId, p.win);
    teamCount.set(p.teamId, (teamCount.get(p.teamId) ?? 0) + 1);
  }
  if (totalItemEvents > MAX_ITEM_EVENTS_PER_GAME) return "too many item events";
  if (teamCount.get(100) !== 5 || teamCount.get(200) !== 5) return "teams must be 5v5";
  if (teamWin.get(100) === teamWin.get(200)) return "exactly one team must win";
  return null;
}

// Plausibility checks: duration-scaled ceilings real games essentially never
// exceed - but an extraordinary real game could. Flags quarantine the game
// for manual review instead of rejecting it.
function plausibilityFlags(g: any): string[] {
  const dur = g.gameDuration;
  const flags: string[] = [];
  for (const p of g.participants) {
    const who = `p${p.participantId} (champ ${p.championId})`;
    if (p.kills > Math.ceil(dur / MIN_SECONDS_PER_KILL)) {
      flags.push(`${who}: ${p.kills} kills in ${dur}s`);
    }
    if (p.deaths > Math.ceil(dur / MIN_SECONDS_PER_DEATH)) {
      flags.push(`${who}: ${p.deaths} deaths in ${dur}s`);
    }
    if (p.assists > Math.ceil(dur / MIN_SECONDS_PER_ASSIST)) {
      flags.push(`${who}: ${p.assists} assists in ${dur}s`);
    }
    if (p.totalDamageDealt > dur * MAX_DAMAGE_DEALT_PER_S) {
      flags.push(`${who}: ${p.totalDamageDealt} damage dealt in ${dur}s`);
    }
    if (p.totalDamageTaken > dur * MAX_DAMAGE_TAKEN_PER_S) {
      flags.push(`${who}: ${p.totalDamageTaken} damage taken in ${dur}s`);
    }
    if (p.totalHeal > dur * MAX_HEAL_PER_S) {
      flags.push(`${who}: ${p.totalHeal} healing in ${dur}s`);
    }
    if (p.goldEarned > GOLD_BASE + dur * MAX_GOLD_PER_S) {
      flags.push(`${who}: ${p.goldEarned} gold in ${dur}s`);
    }
  }
  return flags;
}

// Rebuild the game from known fields only, so the stored quarantine payload
// can't carry anything the schema doesn't define. Item events are dropped
// here - a quarantined game approved later keeps its core stats only.
function sanitizeGame(g: any) {
  return {
    platform: g.platform,
    gameId: g.gameId,
    queueId: g.queueId,
    gameVersion: g.gameVersion,
    gameDuration: g.gameDuration,
    gameCreation: g.gameCreation,
    participants: g.participants.map((p: any) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      championId: p.championId,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      doubleKills: p.doubleKills,
      tripleKills: p.tripleKills,
      quadraKills: p.quadraKills,
      pentaKills: p.pentaKills,
      largestKillingSpree: p.largestKillingSpree,
      totalDamageDealt: p.totalDamageDealt,
      totalDamageTaken: p.totalDamageTaken,
      goldEarned: p.goldEarned,
      totalHeal: p.totalHeal,
      items: p.items.map((it: any) => (it === null ? null : it)),
      augments: p.augments.map((a: any) => ({ slot: a.slot, augmentId: a.augmentId })),
    })),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const token = body?.token;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return json({ error: "invalid contributor token" }, 400);
  }
  const games = body?.games;
  if (!Array.isArray(games) || games.length === 0) return json({ error: "no games" }, 400);
  if (games.length > MAX_GAMES_PER_REQUEST) {
    return json({ error: `max ${MAX_GAMES_PER_REQUEST} games per request` }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const accepted: number[] = [];
  const quarantined: number[] = [];
  const rejected: { gameId: number | null; reason: string }[] = [];
  const matchRows: any[] = [];
  const partRows: any[] = [];
  const augRows: any[] = [];
  const itemEventRows: any[] = [];
  const contribRows: any[] = [];
  const quarantineRows: any[] = [];
  const seen = new Set<string>();

  for (const g of games) {
    const reason = validateStructural(g);
    if (reason) {
      rejected.push({ gameId: isInt(g?.gameId, 1, 1e15) ? g.gameId : null, reason });
      continue;
    }
    // Store year-based patch names regardless of the client version the
    // uploader runs
    g.gameVersion = toYearPatch(g.gameVersion);
    const key = `${g.platform}:${g.gameId}`;
    if (seen.has(key)) {
      rejected.push({ gameId: g.gameId, reason: "duplicate in request" });
      continue;
    }
    seen.add(key);

    const flags = plausibilityFlags(g);
    if (flags.length > 0) {
      quarantineRows.push({
        platform: g.platform,
        game_id: g.gameId,
        payload: sanitizeGame(g),
        reasons: flags,
      });
      // Reported as accepted so the uploader marks it done and doesn't retry;
      // it only enters the stats tables if approved in review.
      accepted.push(g.gameId);
      quarantined.push(g.gameId);
      continue;
    }

    matchRows.push({
      platform: g.platform,
      game_id: g.gameId,
      queue_id: g.queueId,
      game_version: g.gameVersion,
      game_duration: g.gameDuration,
      game_creation: g.gameCreation,
    });
    for (const p of g.participants) {
      partRows.push({
        platform: g.platform,
        game_id: g.gameId,
        participant_id: p.participantId,
        team_id: p.teamId,
        champion_id: p.championId,
        win: p.win,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        double_kills: p.doubleKills,
        triple_kills: p.tripleKills,
        quadra_kills: p.quadraKills,
        penta_kills: p.pentaKills,
        largest_killing_spree: p.largestKillingSpree,
        total_damage_dealt: p.totalDamageDealt,
        total_damage_taken: p.totalDamageTaken,
        gold_earned: p.goldEarned,
        total_heal: p.totalHeal,
        item0: p.items[0],
        item1: p.items[1],
        item2: p.items[2],
        item3: p.items[3],
        item4: p.items[4],
        item5: p.items[5],
        item6: p.items[6],
      });
      for (const a of p.augments) {
        augRows.push({
          platform: g.platform,
          game_id: g.gameId,
          participant_id: p.participantId,
          slot: a.slot,
          augment_id: a.augmentId,
          champion_id: p.championId,
          win: p.win,
        });
      }
      if (Array.isArray(p.itemEvents)) {
        p.itemEvents.forEach((e: any, i: number) => {
          itemEventRows.push({
            platform: g.platform,
            game_id: g.gameId,
            participant_id: p.participantId,
            seq: i,
            game_time: e.gameTime,
            action: e.action,
            item_id: e.itemId,
            count: e.count,
          });
        });
      }
    }
    contribRows.push({ platform: g.platform, game_id: g.gameId });
    accepted.push(g.gameId);
  }

  // One transaction for the whole batch.
  //
  // This used to be five sequential upserts with nothing around them, plus
  // three count(*) queries beforehand for the rate limit. A failure after the
  // first upsert left a match with no participants: counted in every total,
  // contributing nothing, and never retried, because the client had already
  // been told it was accepted. ingest_games() commits all five together and
  // maintains the rate-limit counters in the same transaction, so they cannot
  // drift from what was actually written.
  const { data, error } = await supabase.rpc("ingest_games", {
    p_token: token,
    p_payload: {
      matches: matchRows,
      participants: partRows,
      augments: augRows,
      item_events: itemEventRows,
      contributions: contribRows,
      quarantine: quarantineRows,
    },
    p_burst_lifetime: BURST_LIFETIME,
    p_daily_steady: MAX_GAMES_PER_DAY_STEADY,
    p_max_pending_quarantine: MAX_PENDING_QUARANTINE,
  });

  if (error) return json({ error: "storing games failed" }, 500);
  if (data?.rate_limited) return json({ error: data.error }, 429);

  // Games past the quarantine flood cap were not stored, so they must not be
  // reported accepted: the client would mark them done and never send them
  // again. Told to retry later instead, once the queue has been reviewed.
  const deferred: number[] = Array.isArray(data?.deferred) ? data.deferred.map(Number) : [];
  if (deferred.length > 0) {
    const deferredSet = new Set(deferred);
    for (const id of deferred) {
      rejected.push({ gameId: id, reason: "too many games pending review" });
    }
    return json({
      accepted: accepted.filter((id) => !deferredSet.has(id)),
      rejected,
      quarantined: quarantined.filter((id) => !deferredSet.has(id)),
    });
  }

  return json({ accepted, rejected, quarantined });
});
