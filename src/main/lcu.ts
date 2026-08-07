import {
  authenticate,
  ClientElevatedPermsError,
  ClientNotFoundError,
  createHttp1Request,
  Credentials,
  HttpRequestOptions,
} from "league-connect";
import { BrowserWindow } from "electron";
import * as db from "./db";
import { MAYHEM_QUEUE_IDS } from "../shared/queues";

let credentials: Credentials | null = null;
let status: "disconnected" | "connecting" | "connected" = "disconnected";
let pollTimer: ReturnType<typeof setInterval> | null = null;
let connectTimer: ReturnType<typeof setInterval> | null = null;

function setStatus(newStatus: typeof status, win?: BrowserWindow | null) {
  status = newStatus;
  if (win && !win.isDestroyed()) {
    win.webContents.send("lcu:status-changed", status);
  }
}

export function getStatus() {
  return status;
}

export function friendlyErrorMessage(err: unknown): string {
  if (err instanceof ClientNotFoundError) {
    return "League client is not running";
  }
  if (err instanceof ClientElevatedPermsError) {
    return "League client is running as administrator — run Mayhem Tracker as administrator to connect";
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ECONNRESET|socket hang up|EPIPE/i.test(message)) {
    return "Lost connection to the League client";
  }
  return message;
}

async function connect(): Promise<Credentials> {
  credentials = await authenticate({ windowsShell: "powershell" });
  return credentials;
}

async function lcuRequest(url: string, method: HttpRequestOptions["method"] = "GET") {
  if (!credentials) {
    await connect();
  }
  const response = await createHttp1Request({ url, method }, credentials!);
  if (!response.ok) {
    throw new Error(`LCU request failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function fetchCurrentSummoner(): Promise<any> {
  return lcuRequest("/lol-summoner/v1/current-summoner");
}

async function fetchMatchHistoryByPuuid(puuid: string, begIndex = 0, endIndex = 19): Promise<any> {
  return lcuRequest(
    `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${begIndex}&endIndex=${endIndex}`,
  );
}

async function fetchMatchHistory(begIndex = 0, endIndex = 19): Promise<any> {
  return lcuRequest(
    `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${begIndex}&endIndex=${endIndex}`,
  );
}

async function fetchGameDetails(gameId: number): Promise<any> {
  return lcuRequest(`/lol-match-history/v1/games/${gameId}`);
}

// --- Deep history (SGP) ---------------------------------------------------
//
// The LCU's match list is capped at 20 games: begIndex/endIndex are accepted
// but ignored by the backend, so paging it just returns the same 20 over and
// over. The client itself gets its ids from Riot's player-platform service
// instead, which does honour startIndex/count and reaches back years. We use
// the same endpoint to get ids, then hydrate each one through the LCU — that
// still returns full detail for arbitrary old games, in the shape we parse.

const SGP_HOSTS = [
  "https://usw2-red.pp.sgp.pvp.net",
  "https://euc1-red.pp.sgp.pvp.net",
  "https://apne1-red.pp.sgp.pvp.net",
  "https://apse1-red.pp.sgp.pvp.net",
];

const SGP_HOST_BY_REGION: Record<string, string> = {
  NA: SGP_HOSTS[0],
  BR: SGP_HOSTS[0],
  LAN: SGP_HOSTS[0],
  LAS: SGP_HOSTS[0],
  LA1: SGP_HOSTS[0],
  LA2: SGP_HOSTS[0],
  EUW: SGP_HOSTS[1],
  EUNE: SGP_HOSTS[1],
  EUN: SGP_HOSTS[1],
  TR: SGP_HOSTS[1],
  RU: SGP_HOSTS[1],
  ME: SGP_HOSTS[1],
  KR: SGP_HOSTS[2],
  JP: SGP_HOSTS[2],
  OCE: SGP_HOSTS[3],
  OC1: SGP_HOSTS[3],
  PH: SGP_HOSTS[3],
  SG: SGP_HOSTS[3],
  TH: SGP_HOSTS[3],
  TW: SGP_HOSTS[3],
  VN: SGP_HOSTS[3],
};

const SGP_PAGE_SIZE = 100;
// Safety bound only. Paging normally ends when the service returns a short
// page; this just stops a runaway loop, and hitting it is reported rather than
// silently trimming someone's history.
const SGP_MAX_PAGES = 200;

let sgpHost: string | null = null;
let backfillRunning = false;

function sgpMatchIdsUrl(host: string, puuid: string, startIndex: number, count: number) {
  return (
    `${host}/match-history-query/v1/products/lol/player/${puuid}` +
    `?startIndex=${startIndex}&count=${count}&tagsQueryType=AND`
  );
}

async function fetchSgpToken(): Promise<string> {
  const token = await lcuRequest("/lol-league-session/v1/league-session-token");
  if (typeof token !== "string" || !token) {
    throw new Error("League client hasn't finished signing in — try again in a moment");
  }
  return token;
}

// The service is sharded by geography, not by game region, so the region map is
// a first guess only. Probe candidates until one answers, then remember it.
async function resolveSgpHost(puuid: string, token: string): Promise<string> {
  if (sgpHost) return sgpHost;

  const cached = db.getSetting("sgp_host");
  if (cached && SGP_HOSTS.includes(cached)) {
    sgpHost = cached;
    return cached;
  }

  let guess: string | undefined;
  try {
    const regionLocale = await lcuRequest("/riotclient/region-locale");
    guess = SGP_HOST_BY_REGION[String(regionLocale?.region || "").toUpperCase()];
  } catch {
    // Fall through to probing every shard
  }

  const candidates = guess ? [guess, ...SGP_HOSTS.filter((h) => h !== guess)] : SGP_HOSTS;
  for (const host of candidates) {
    try {
      const response = await fetch(sgpMatchIdsUrl(host, puuid, 0, 1), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        sgpHost = host;
        db.setSetting("sgp_host", host);
        return host;
      }
    } catch {
      // Try the next shard
    }
  }

  throw new Error("Could not reach Riot's match history service for your region");
}

async function fetchAllMatchIds(
  host: string,
  puuid: string,
  token: string,
  stopAfterPage: (pageIds: number[]) => boolean,
): Promise<{ ids: number[]; truncated: boolean }> {
  const ids: number[] = [];

  for (let page = 0; page < SGP_MAX_PAGES; page++) {
    const response = await fetch(sgpMatchIdsUrl(host, puuid, page * SGP_PAGE_SIZE, SGP_PAGE_SIZE), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Match history service returned ${response.status}`);
    }

    const body = await response.json();
    if (!Array.isArray(body) || body.length === 0) return { ids, truncated: false };

    // Ids arrive platform-prefixed, e.g. "NA1_5616465966"
    const pageIds: number[] = [];
    for (const id of body) {
      const gameId = Number(String(id).split("_").pop());
      if (Number.isFinite(gameId)) pageIds.push(gameId);
    }
    ids.push(...pageIds);

    // A short page means we've reached the end of the account's history
    if (body.length < SGP_PAGE_SIZE) return { ids, truncated: false };
    if (stopAfterPage(pageIds)) return { ids, truncated: false };
  }

  return { ids, truncated: true };
}

export async function backfillHistory(win?: BrowserWindow | null): Promise<{
  added: number;
  scanned: number;
  checked: number;
  totalGames: number;
  truncated: boolean;
}> {
  if (backfillRunning) {
    throw new Error("A backfill is already running");
  }
  backfillRunning = true;

  try {
    await connect();

    const summoner = await fetchCurrentSummoner();
    db.upsertSummoner(summoner);

    const token = await fetchSgpToken();
    const host = await resolveSgpHost(summoner.puuid, token);

    const known = db.getKnownGameIds();

    // Once an account has been walked all the way back, a later run only needs
    // the new games at the front. Results are newest-first, so the first page
    // we've already fully accounted for means everything older is accounted for
    // too. Tracked per account, since a newly added one still needs a full walk.
    const completedKey = `backfill_complete_${summoner.puuid}`;
    const walkedBefore = db.getSetting(completedKey) === "1";

    const { ids, truncated } = await fetchAllMatchIds(
      host,
      summoner.puuid,
      token,
      (pageIds) => walkedBefore && pageIds.every((id) => known.has(id)),
    );

    if (truncated) {
      console.warn(
        `Backfill stopped at the ${SGP_MAX_PAGES}-page limit (${ids.length} games); older games were not checked`,
      );
    } else {
      db.setSetting(completedKey, "1");
    }

    const pending = ids.filter((id) => !known.has(id));

    const progress = (current: number, added: number) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("lcu:backfill-progress", { current, total: pending.length, added });
      }
    };
    progress(0, 0);

    let added = 0;
    for (let i = 0; i < pending.length; i++) {
      const gameId = pending[i];

      let game: any;
      try {
        game = await fetchGameDetails(gameId);
      } catch {
        // Leave it unrecorded so a later run retries it
        progress(i + 1, added);
        continue;
      }

      if (!MAYHEM_QUEUE_IDS.includes(game.queueId)) {
        db.markIgnoredGame(gameId);
      } else if (db.insertGameFull(game, summoner.puuid)) {
        added++;
        console.log(`Backfilled ARAM Mayhem game ${gameId}`);
      }

      progress(i + 1, added);
    }

    if (added > 0 && win && !win.isDestroyed()) {
      win.webContents.send("lcu:games-updated");
    }

    const dashboard = db.getDashboardData();
    return {
      added,
      scanned: ids.length,
      checked: pending.length,
      totalGames: dashboard.totalGames,
      truncated,
    };
  } finally {
    backfillRunning = false;
  }
}

export async function fetchNewGames(
  win?: BrowserWindow | null,
): Promise<{ newGames: number; totalGames: number }> {
  await connect();

  const summoner = await fetchCurrentSummoner();
  db.upsertSummoner(summoner);

  let newGamesCount = 0;

  let historyResponse: any;
  try {
    historyResponse = await fetchMatchHistoryByPuuid(summoner.puuid, 0, 19);
  } catch {
    try {
      historyResponse = await fetchMatchHistory(0, 19);
    } catch {
      return { newGames: 0, totalGames: 0 };
    }
  }

  const games = historyResponse.games?.games || historyResponse.games || [];

  for (const game of games) {
    if (db.gameExists(game.gameId)) continue;
    if (!MAYHEM_QUEUE_IDS.includes(game.queueId)) continue;

    let fullGame: any;
    try {
      fullGame = await fetchGameDetails(game.gameId);
    } catch {
      fullGame = game;
    }

    const inserted = db.insertGameFull(fullGame, summoner.puuid);
    if (inserted) {
      newGamesCount++;
      console.log(`Stored ARAM Mayhem game ${fullGame.gameId}`);
    }
  }

  if (newGamesCount > 0 && win && !win.isDestroyed()) {
    win.webContents.send("lcu:games-updated");
  }

  const dashboard = db.getDashboardData();
  return { newGames: newGamesCount, totalGames: dashboard.totalGames };
}

export function startPolling(win: BrowserWindow, firstAttempt = true) {
  // Show "connecting" only on the very first attempt after app launch
  setStatus(firstAttempt ? "connecting" : "disconnected", win);

  connectTimer = setInterval(async () => {
    try {
      await connect();
      setStatus("connected", win);
      if (connectTimer) {
        clearInterval(connectTimer);
        connectTimer = null;
      }

      // Do initial fetch
      await fetchNewGames(win);

      // Start polling for new games every 60s
      pollTimer = setInterval(async () => {
        try {
          await fetchNewGames(win);
        } catch (err) {
          console.log("Poll fetch error:", err);
          // Lost connection, restart connect loop
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          startPolling(win, false);
        }
      }, 60000);
    } catch {
      // Client not found yet — after first attempt, show disconnected
      if (firstAttempt) {
        firstAttempt = false;
        setStatus("disconnected", win);
      }
    }
  }, 5000);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (connectTimer) {
    clearInterval(connectTimer);
    connectTimer = null;
  }
}
