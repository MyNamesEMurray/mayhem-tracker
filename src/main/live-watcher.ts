import { fetchLive } from "./live-debug";
import { LiveGameSession, matchSessionToGame, type LiveItemEvent } from "../shared/live-events";
import type { LiveGameState } from "../shared/api";
import { getMainWindow } from "./window-ref";
import * as db from "./db";

// Build-order tracking: while a game runs, snapshots of the Live Client
// Data API are diffed into item add/remove events for all ten players (plus
// spell-slot augment pickups). When the finished game lands in the database
// from the LCU sync, its players are matched by riot id and the events are
// stored against the game. On by default; costs a failed localhost request
// every PROBE_MS while no game is running.

const PROBE_MS = 15_000;
const POLL_MS = 5_000;
const MAX_FAILURES = 3;
// A finished session waits this long for the LCU to deliver the game
const PENDING_TTL = 30 * 60_000;

let probeTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let session: LiveGameSession | null = null;
let failures = 0;
let polling = false;
const pending: LiveGameSession[] = [];

// Called when a game ends, so the LCU sync can pick the match up right away
// instead of waiting out the 60s poll. Registered from the app entry point
// to keep this module free of a cycle back into lcu.ts.
let gameEndedHandler: (() => void) | null = null;

export function setGameEndedHandler(fn: () => void) {
  gameEndedHandler = fn;
}

// What the renderer needs to draw the in-game panel: who is being played,
// which augments are already taken, and what is in the bag. Derived from the
// same session the build-order tracking already keeps, so a running game costs
// nothing extra - this is the snapshot it was taking anyway, read a second way.
export function getLiveGame(): LiveGameState {
  if (!session || !enabled()) return { inGame: false };
  return {
    inGame: true,
    championName: session.activeChampion,
    gameMode: session.gameMode,
    gameTime: session.lastGameTime,
    takenAugments: session.takenAugments(),
    heldItems: session.heldItems(),
  };
}

// Pushed rather than polled: the watcher already wakes every POLL_MS, and a
// panel that has to poll for a thing that changes three times a game is a
// timer nobody needs. Only sent when something the panel draws has changed.
let lastPushed = "";
function pushLiveGame() {
  const state = getLiveGame();
  // The held items go in by id, not by count: a combine takes two components
  // and a recipe and hands back one item, and a sell-then-buy in the same
  // five seconds leaves the count where it started - either way the bag is
  // different and the build panel has to be told.
  const key = JSON.stringify([
    state.inGame,
    state.championName,
    state.takenAugments?.length ?? 0,
    [...(state.heldItems ?? [])].sort((a, b) => a - b),
  ]);
  if (key === lastPushed) return;
  lastPushed = key;
  getMainWindow()?.webContents.send("live:changed", state);
}

function endSession() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (session) {
    session.endedAt = Date.now();
    if (session.events.length > 0) pending.push(session);
    console.log(`Live watcher: game ended, ${session.events.length} events captured`);
    session = null;
    pushLiveGame();
    gameEndedHandler?.();
  }
  const cutoff = Date.now() - PENDING_TTL;
  while (pending.length > 0 && (pending[0].endedAt ?? 0) < cutoff) pending.shift();
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const data = await fetchLive();
    failures = 0;
    if (!session) session = new LiveGameSession();
    session.ingest(data);
    pushLiveGame();
  } catch {
    if (++failures >= MAX_FAILURES) endSession();
  } finally {
    polling = false;
  }
}

async function probe() {
  if (pollTimer) return;
  try {
    const data = await fetchLive();
    session = new LiveGameSession();
    session.ingest(data);
    failures = 0;
    pushLiveGame();
    pollTimer = setInterval(poll, POLL_MS);
    console.log("Live watcher: game detected, tracking build orders");
  } catch {
    // No game running
  }
}

function enabled(): boolean {
  // Default on - "false" is the only opt-out value
  return db.getSetting("live_tracking_enabled") !== "false";
}

export function refreshLiveWatcher() {
  if (enabled() && !probeTimer) {
    probeTimer = setInterval(probe, PROBE_MS);
    void probe();
  } else if (!enabled() && probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
    endSession();
    pending.length = 0;
    pushLiveGame();
  }
}

// Riot ids per participant from a raw game payload, handling both the LCU
// shape (participantIdentities) and the SGP shape (riotIdGameName on the
// participant itself).
function gameRiotIds(raw: any): { participantId: number; riotId: string | null }[] {
  const identities = new Map<number, any>();
  for (const id of raw?.participantIdentities ?? []) {
    identities.set(id?.participantId, id?.player);
  }
  return (raw?.participants ?? []).map((p: any) => {
    const player = identities.get(p?.participantId);
    const name = player?.gameName ?? p?.riotIdGameName ?? null;
    const tag = player?.tagLine ?? p?.riotIdTagline ?? null;
    return {
      participantId: p?.participantId,
      riotId: name && tag ? `${name}#${tag}` : null,
    };
  });
}

// Called after the LCU sync inserts a new game: if a finished live session
// matches its players, store the session's events against the game.
export function tryAttachLiveEvents(rawGame: any, gameId: number): void {
  if (pending.length === 0) return;
  const participants = gameRiotIds(rawGame);
  for (let i = pending.length - 1; i >= 0; i--) {
    const s = pending[i];
    const mapping = matchSessionToGame(s.riotIds, participants);
    if (!mapping) continue;
    const rows = s.events
      .filter((e: LiveItemEvent) => mapping.has(e.riotId))
      .map((e) => ({
        participantId: mapping.get(e.riotId)!,
        gameTime: e.gameTime,
        action: e.action,
        itemId: e.itemId,
        count: e.count,
        detail: e.detail,
      }));
    pending.splice(i, 1);
    if (rows.length > 0) {
      db.storeLiveEvents(gameId, rows);
      console.log(`Live watcher: attached ${rows.length} build-order events to game ${gameId}`);
    }
    return;
  }
}
