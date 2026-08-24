// The community database, in the app.
//
// The website reads three aggregate views straight from Supabase; so does
// this, once, into a local cache. That's what lets someone look up a build
// without leaving the tracker — and it's the difference between the
// Champions tab showing "no Braum games yet" (true of your own history) and
// showing what everyone's games say about Braum.
//
// The rows are the same public aggregates the site reads: counts grouped by
// patch, queue, champion, augment, and item. No individual games, no
// identity — there is nothing else readable behind the anon key.
import { gunzipSync, gzipSync } from "zlib";
import fs from "fs";
import path from "path";
import { getDataDir } from "./paths";
import { MAYHEM_QUEUE_IDS } from "../shared/queues";

const SUPABASE_URL = "https://lmzenzxbhotszvwsnhlm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtemVuenhiaG90c3p2d3NuaGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjU0NDcsImV4cCI6MjEwMTgwMTQ0N30.7FoFD7LFaV5Yin4OnjYjECAYZPa2I9xc6oQa4xPAKpA";

// Long enough that opening the app repeatedly costs nothing, short enough
// that a session's worth of new games shows up the same day
const TTL_MS = 6 * 60 * 60 * 1000;
const PAGE = 1000;

export interface CommunityChampionRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  damage_taken: number;
  heal: number;
  gold: number;
  pentas: number;
}

export interface CommunityAugmentRow {
  patch: string;
  queue_id: number;
  augment_id: number;
  champion_id: number;
  picks: number;
  wins: number;
}

export interface CommunityItemRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  item_id: number;
  picks: number;
  wins: number;
}

// Only the champion grain is cached wholesale — 3.5k rows. The augment and
// item grains are per (patch, queue, champion, thing) and run to well over
// half a million rows between them, so those are fetched for one champion at
// a time, when a champion page asks.
interface Cache {
  fetchedAt: number;
  champions: CommunityChampionRow[];
}

let memory: Cache | null = null;
let inFlight: Promise<Cache> | null = null;

interface ChampionDetailCache {
  fetchedAt: number;
  augments: CommunityAugmentRow[];
  items: CommunityItemRow[];
}

// Champion pages get revisited constantly while comparing builds; holding the
// last handful in memory makes going back and forth free. Not persisted —
// it's a session convenience, not the app's data.
const detailCache = new Map<number, ChampionDetailCache>();
const DETAIL_LIMIT = 24;

const cacheFile = () => path.join(getDataDir(), "community-cache.json.gz");

function readCache(): Cache | null {
  if (memory) return memory;
  try {
    const raw = gunzipSync(fs.readFileSync(cacheFile())).toString("utf8");
    memory = JSON.parse(raw) as Cache;
    return memory;
  } catch {
    // No cache yet, or an unreadable one — refetch rather than fail
    return null;
  }
}

function writeCache(cache: Cache): void {
  memory = cache;
  try {
    fs.writeFileSync(cacheFile(), gzipSync(Buffer.from(JSON.stringify(cache), "utf8")));
  } catch (err) {
    // A cache that can't be written costs a refetch next launch, nothing more
    console.warn(`community: could not write cache (${(err as Error).message})`);
  }
}

// PostgREST caps a response at 1000 rows, and the three views together are
// ~29k — so paging them one after another was 30 sequential round trips
// before the Champions tab could draw anything. The first request asks for
// an exact count, and the rest of the pages then go out at once.
async function fetchPage<T>(view: string, query: string, from: number, withCount: boolean) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Range: `${from}-${from + PAGE - 1}`,
      ...(withCount ? { Prefer: "count=exact" } : {}),
    },
  });
  if (!res.ok) throw new Error(`${view} returned HTTP ${res.status}`);
  const rows = (await res.json()) as T[];
  // "0-999/13684" — the total is what lets the remaining pages be parallel
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  return { rows, total: Number.isFinite(total) ? total : null };
}

async function fetchView<T>(view: string, query: string): Promise<T[]> {
  const first = await fetchPage<T>(view, query, 0, true);
  if (first.rows.length < PAGE) return first.rows;

  if (first.total == null) {
    // No count header: fall back to walking pages until one comes up short
    const out = [...first.rows];
    for (let from = PAGE; ; from += PAGE) {
      const page = await fetchPage<T>(view, query, from, false);
      out.push(...page.rows);
      if (page.rows.length < PAGE) return out;
    }
  }

  const offsets: number[] = [];
  for (let from = PAGE; from < first.total; from += PAGE) offsets.push(from);
  const rest = await Promise.all(offsets.map((from) => fetchPage<T>(view, query, from, false)));
  return [...first.rows, ...rest.flatMap((p) => p.rows)];
}

// Only the columns the app actually reads. augment_stats carries per-augment
// combat lines this never touches, and they dominate its payload.
const CHAMPION_QUERY =
  "select=patch,queue_id,champion_id,games,wins,kills,deaths,assists,damage,damage_taken,heal,gold,pentas";
const AUGMENT_QUERY = "select=patch,queue_id,augment_id,champion_id,picks,wins";
const ITEM_QUERY = "select=patch,queue_id,champion_id,item_id,picks,wins";

// Serves the cache when it's fresh, refetches when it isn't, and falls back to
// stale data if the network is unavailable — an offline client should still
// show the numbers it had rather than an error.
export async function loadCommunity({ force = false } = {}): Promise<Cache> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  // Stale but present: hand it back immediately and refresh behind the tab.
  // Waiting on the network for six-hour-old numbers to become five-minute-old
  // numbers is the difference between the tab opening and the tab hanging.
  if (!force && cached) {
    if (!inFlight) void refresh().catch(() => {});
    return cached;
  }
  if (inFlight) return inFlight;

  return refresh(cached);
}

function refresh(cached: Cache | null = readCache()): Promise<Cache> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const champions = await fetchView<CommunityChampionRow>("champion_stats", CHAMPION_QUERY);
      const cache: Cache = { fetchedAt: Date.now(), champions };
      detailCache.clear();
      writeCache(cache);
      return cache;
    } catch (err) {
      if (cached) {
        console.warn(`community: refresh failed (${(err as Error).message}) — serving cache`);
        return cached;
      }
      throw err;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

const matches = (row: { patch: string; queue_id: number }, patch?: string, queue?: number) =>
  (patch == null || row.patch === patch) &&
  (queue == null ? MAYHEM_QUEUE_IDS.includes(row.queue_id) : row.queue_id === queue);

export interface CommunityChampionStats {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_damage: number;
  avg_gold: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
}

// Shaped like the local ChampionStats so the Champions table renders either
// source without a second code path. The multikill columns below penta aren't
// in the community aggregate, so they come back zero and the table hides the
// column for this source.
export async function getCommunityChampionStats(
  patch?: string,
  queue?: number,
): Promise<CommunityChampionStats[]> {
  const { champions } = await loadCommunity();
  const byChampion = new Map<number, CommunityChampionStats>();
  for (const r of champions) {
    if (!matches(r, patch, queue)) continue;
    let e = byChampion.get(r.champion_id);
    if (!e) {
      e = {
        champion_id: r.champion_id,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        avg_kills: 0,
        avg_deaths: 0,
        avg_assists: 0,
        avg_damage: 0,
        avg_gold: 0,
        double_kills: 0,
        triple_kills: 0,
        quadra_kills: 0,
        penta_kills: 0,
      };
      byChampion.set(r.champion_id, e);
    }
    e.games += r.games;
    e.wins += r.wins;
    e.kills += r.kills;
    e.deaths += r.deaths;
    e.assists += r.assists;
    e.penta_kills += r.pentas;
    // Sums for now, divided through once the group is complete
    e.avg_damage += r.damage;
    e.avg_gold += r.gold;
  }
  // Rounded here, matching the ROUND() in the local getChampionStats query
  // (db.ts): a K/D/A to one decimal, damage and gold whole. Doing it at the
  // source keeps both sources identical without every render site having to
  // remember — the raw quotient reached the table as 10.633333333333333.
  const oneDp = (n: number) => Math.round(n * 10) / 10;
  for (const e of byChampion.values()) {
    const n = Math.max(e.games, 1);
    e.avg_kills = oneDp(e.kills / n);
    e.avg_deaths = oneDp(e.deaths / n);
    e.avg_assists = oneDp(e.assists / n);
    e.avg_damage = Math.round(e.avg_damage / n);
    e.avg_gold = Math.round(e.avg_gold / n);
  }
  return [...byChampion.values()].sort((a, b) => b.games - a.games);
}

// One champion's augment and item rows, fetched from the server filtered to
// that champion. Both views are indexed on champion_id, so this is a couple of
// thousand rows rather than the half-million the full grain would cost.
async function loadChampionDetail(championId: number): Promise<ChampionDetailCache> {
  const hit = detailCache.get(championId);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit;

  const [augments, items] = await Promise.all([
    fetchView<CommunityAugmentRow>(
      "augment_stats",
      `${AUGMENT_QUERY}&champion_id=eq.${championId}`,
    ),
    fetchView<CommunityItemRow>("item_stats", `${ITEM_QUERY}&champion_id=eq.${championId}`),
  ]);

  const entry: ChampionDetailCache = { fetchedAt: Date.now(), augments, items };
  detailCache.set(championId, entry);
  // Oldest insertion first, so deleting the first key evicts the least
  // recently fetched champion
  if (detailCache.size > DETAIL_LIMIT) {
    detailCache.delete(detailCache.keys().next().value as number);
  }
  return entry;
}

export async function getCommunityChampionDetail(
  championId: number,
  patch?: string,
  queue?: number,
): Promise<{
  augments: { augment_id: number; picks: number; wins: number }[];
  items: { item_id: number; picks: number; wins: number }[];
}> {
  const { augments, items } = await loadChampionDetail(championId);
  const augTotals = new Map<number, { augment_id: number; picks: number; wins: number }>();
  for (const r of augments) {
    if (r.champion_id !== championId || !matches(r, patch, queue)) continue;
    const e = augTotals.get(r.augment_id) ?? { augment_id: r.augment_id, picks: 0, wins: 0 };
    e.picks += r.picks;
    e.wins += r.wins;
    augTotals.set(r.augment_id, e);
  }
  const itemTotals = new Map<number, { item_id: number; picks: number; wins: number }>();
  for (const r of items) {
    if (r.champion_id !== championId || !matches(r, patch, queue)) continue;
    const e = itemTotals.get(r.item_id) ?? { item_id: r.item_id, picks: 0, wins: 0 };
    e.picks += r.picks;
    e.wins += r.wins;
    itemTotals.set(r.item_id, e);
  }
  return {
    augments: [...augTotals.values()].sort((a, b) => b.picks - a.picks),
    items: [...itemTotals.values()].sort((a, b) => b.picks - a.picks),
  };
}

// Patches present in the community data, newest first — the app's patch
// filter offers these when the community source is selected, since the local
// database's patch list can be a subset (or, on a fresh install, empty)
export async function getCommunityMeta(): Promise<{
  fetchedAt: number;
  patches: string[];
  queues: number[];
  games: number;
}> {
  const { champions, fetchedAt } = await loadCommunity();
  const patches = [...new Set(champions.map((r) => r.patch))].sort((a, b) => {
    const [am, an] = a.split(".").map(Number);
    const [bm, bn] = b.split(".").map(Number);
    return bm - am || bn - an;
  });
  const slots = champions.reduce((sum, r) => sum + r.games, 0);
  return {
    fetchedAt,
    patches,
    queues: [...new Set(champions.map((r) => r.queue_id))].sort(),
    // Ten champion slots per game
    games: Math.round(slots / 10),
  };
}
