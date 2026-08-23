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

interface Cache {
  fetchedAt: number;
  champions: CommunityChampionRow[];
  augments: CommunityAugmentRow[];
  items: CommunityItemRow[];
}

let memory: Cache | null = null;
let inFlight: Promise<Cache> | null = null;

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

async function fetchView<T>(view: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${view} returned HTTP ${res.status}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// Serves the cache when it's fresh, refetches when it isn't, and falls back to
// stale data if the network is unavailable — an offline client should still
// show the numbers it had rather than an error.
export async function loadCommunity({ force = false } = {}): Promise<Cache> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [champions, augments, items] = await Promise.all([
        fetchView<CommunityChampionRow>("champion_stats"),
        fetchView<CommunityAugmentRow>("augment_stats"),
        fetchView<CommunityItemRow>("item_stats"),
      ]);
      const cache: Cache = { fetchedAt: Date.now(), champions, augments, items };
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
  for (const e of byChampion.values()) {
    const n = Math.max(e.games, 1);
    e.avg_kills = e.kills / n;
    e.avg_deaths = e.deaths / n;
    e.avg_assists = e.assists / n;
    e.avg_damage = e.avg_damage / n;
    e.avg_gold = e.avg_gold / n;
  }
  return [...byChampion.values()].sort((a, b) => b.games - a.games);
}

export async function getCommunityChampionDetail(
  championId: number,
  patch?: string,
  queue?: number,
): Promise<{
  augments: { augment_id: number; picks: number; wins: number }[];
  items: { item_id: number; picks: number; wins: number }[];
}> {
  const { augments, items } = await loadCommunity();
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
