import { getMainWindow } from "./window-ref";
import { BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import * as db from "./db";

// The Supabase project holding the anonymous community stats. The key below
// is the project's public client credential (safe to ship): all writes go
// through the validating ingest function, and the tables are locked behind
// row level security with only aggregate views readable.
const SUPABASE_URL = "https://lmzenzxbhotszvwsnhlm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtemVuenhiaG90c3p2d3NuaGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjU0NDcsImV4cCI6MjEwMTgwMTQ0N30.7FoFD7LFaV5Yin4OnjYjECAYZPa2I9xc6oQa4xPAKpA";
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest`;
const DELETE_URL = `${SUPABASE_URL}/functions/v1/delete-contributions`;

// Matches the ingest function's per-request cap
const BATCH_SIZE = 50;

export function isUploadEnabled(): boolean {
  return db.getSetting("upload_enabled") === "true";
}

// Random id the server rate-limits and deletes by. Generated locally and not
// derived from any account or player data — it is the only handle a
// contributor has on what they've shared, which is why it can be read,
// carried to another machine, and replaced.
function getContributorToken(): string {
  let token = db.getSetting("contributor_token");
  if (!token) {
    token = randomUUID();
    db.setSetting("contributor_token", token);
  }
  return token;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read-only view for Settings. Creating one here would mint an id for someone
// who has never contributed, so an install that hasn't uploaded reports none.
export function getContributorId(): string | null {
  return db.getSetting("contributor_token") ?? null;
}

// Carry an existing id onto this machine. The upload marks go with it: this
// install's games are re-sent under the recovered id, and the server dedupes
// on (token, platform, game_id), so nothing is contributed twice.
export function setContributorId(
  token: string,
  win?: BrowserWindow | null,
): { success: boolean; error?: string } {
  const trimmed = token.trim().toLowerCase();
  if (!UUID_RE.test(trimmed)) {
    return { success: false, error: "That doesn't look like a contributor ID." };
  }
  if (trimmed === db.getSetting("contributor_token")) {
    return { success: true };
  }
  db.setSetting("contributor_token", trimmed);
  db.clearUploadMarks();
  notifyChanged(win);
  return { success: true };
}

// Replace a leaked id. Order matters: the games have to be withdrawn while the
// old id can still prove it owns them, because the server only lets a token
// delete what that token contributed. If the withdrawal fails, nothing is
// changed — a new id here would strand the old contributions permanently.
export async function rotateContributorId(
  win?: BrowserWindow | null,
): Promise<{ success: boolean; newId?: string; removedMatches?: number; error?: string }> {
  const current = db.getSetting("contributor_token");
  if (!current) {
    // Nothing has been contributed, so there is nothing to withdraw
    const fresh = randomUUID();
    db.setSetting("contributor_token", fresh);
    notifyChanged(win);
    return { success: true, newId: fresh, removedMatches: 0 };
  }

  const wasEnabled = isUploadEnabled();
  const removal = await deleteContributions(win);
  if (!removal.success) {
    return { success: false, error: removal.error ?? "Could not withdraw the old contributions." };
  }

  const fresh = randomUUID();
  db.setSetting("contributor_token", fresh);
  // deleteContributions turns contributing off and forgets the upload marks;
  // a rotation is not an opt-out, so put it back and let the uploader re-send
  // this install's games under the new id.
  if (wasEnabled) {
    db.setSetting("upload_enabled", "true");
    void uploadPendingGames(win).catch(() => {});
  }
  notifyChanged(win);
  return { success: true, newId: fresh, removedMatches: removal.removedMatches ?? 0 };
}

let uploadRunning = false;
let lastError: string | null = null;

export function getUploadStatus() {
  return {
    enabled: isUploadEnabled(),
    running: uploadRunning,
    lastError,
    ...db.getUploadCounts(),
  };
}

function notifyChanged(_win?: BrowserWindow | null) {
  const w = getMainWindow();
  if (w) {
    w.webContents.send("upload:changed");
  }
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON error body
  }
  return { ok: res.ok, status: res.status, data };
}

// The payload is anonymous by construction: getPendingUploadGames never
// selects puuid, name, tag, or icon columns, so they cannot leak from here.
function gamePayload(g: db.PendingUploadGame) {
  return {
    platform: g.platform_id,
    gameId: g.game_id,
    queueId: g.queue_id,
    gameVersion: g.game_version,
    gameDuration: g.game_duration,
    gameCreation: g.game_creation,
    participants: g.participants.map((p) => ({
      participantId: p.participant_id,
      teamId: p.team_id,
      championId: p.champion_id,
      win: !!p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      doubleKills: p.double_kills,
      tripleKills: p.triple_kills,
      quadraKills: p.quadra_kills,
      pentaKills: p.penta_kills,
      largestKillingSpree: p.largest_killing_spree,
      totalDamageDealt: p.total_damage_dealt,
      totalDamageTaken: p.total_damage_taken,
      goldEarned: p.gold_earned,
      totalHeal: p.total_heal,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
      augments: p.augments.map((a) => ({ slot: a.slot, augmentId: a.augment_id })),
      // Only present for games the live watcher tracked; the server caps
      // and validates these, so trim to its per-participant bound
      ...(p.itemEvents.length > 0
        ? {
            itemEvents: p.itemEvents.slice(0, 120).map((e) => ({
              gameTime: Math.max(0, Math.round(e.game_time)),
              action: e.action,
              itemId: e.item_id,
              count: e.count,
            })),
          }
        : {}),
    })),
  };
}

// Send every pending game in batches. Safe to call opportunistically — it
// no-ops when disabled or already running, and a failed batch just leaves
// the rest pending for the next sync.
export async function uploadPendingGames(
  win?: BrowserWindow | null,
): Promise<{ uploaded: number; rejected: number; error?: string }> {
  if (uploadRunning || !isUploadEnabled()) {
    return { uploaded: 0, rejected: 0 };
  }
  uploadRunning = true;
  lastError = null;
  let uploaded = 0;
  let rejectedCount = 0;
  try {
    const token = getContributorToken();
    while (isUploadEnabled()) {
      const games = db.getPendingUploadGames(BATCH_SIZE);
      if (games.length === 0) break;

      const res = await postJson(INGEST_URL, { token, games: games.map(gamePayload) });
      if (!res.ok) {
        // Rate limit or transient failure: remaining games stay pending and
        // are retried on a later sync
        lastError = res.data?.error || `Upload failed (HTTP ${res.status})`;
        break;
      }

      const accepted: number[] = Array.isArray(res.data?.accepted) ? res.data.accepted : [];
      const rejected: { gameId: number | null; reason: string }[] = Array.isArray(
        res.data?.rejected,
      )
        ? res.data.rejected
        : [];
      const marks: { gameId: number; status: "done" | "rejected" }[] = [];
      for (const id of accepted) {
        if (typeof id === "number") marks.push({ gameId: id, status: "done" });
      }
      for (const r of rejected) {
        if (typeof r?.gameId === "number") marks.push({ gameId: r.gameId, status: "rejected" });
      }
      // A response that marks nothing would loop forever on the same batch
      if (marks.length === 0) {
        lastError = "Upload service returned no results";
        break;
      }
      db.markGameUploads(marks);
      uploaded += accepted.length;
      rejectedCount += rejected.length;
      notifyChanged(win);
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    uploadRunning = false;
    notifyChanged(win);
  }
  return { uploaded, rejected: rejectedCount, error: lastError ?? undefined };
}

export async function setUploadEnabled(
  enabled: boolean,
  win?: BrowserWindow | null,
): Promise<void> {
  db.setSetting("upload_enabled", String(enabled));
  notifyChanged(win);
  if (enabled) {
    void uploadPendingGames(win);
  }
}

// Ask the server to remove everything this install contributed, then stop
// contributing and forget the upload marks so a future opt-in re-uploads.
export async function deleteContributions(
  win?: BrowserWindow | null,
): Promise<{ success: boolean; removedMatches?: number; error?: string }> {
  const token = db.getSetting("contributor_token");
  if (!token) {
    return { success: true, removedMatches: 0 };
  }
  try {
    const res = await postJson(DELETE_URL, { token });
    if (!res.ok) {
      return { success: false, error: res.data?.error || `Delete failed (HTTP ${res.status})` };
    }
    db.setSetting("upload_enabled", "false");
    db.clearUploadMarks();
    notifyChanged(win);
    return { success: true, removedMatches: res.data?.removedMatches ?? 0 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
