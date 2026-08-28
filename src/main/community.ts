// The community database, in the app.
//
// The website reads three aggregate views straight from Supabase; so does
// this, once, into a local cache. That's what lets someone look up a build
// without leaving the tracker - and it's the difference between the
// Champions tab showing "no Braum games yet" (true of your own history) and
// showing what everyone's games say about Braum.
//
// The rows are the same public aggregates the site reads: counts grouped by
// patch, queue, champion, augment, and item. No individual games, no
// identity - there is nothing else readable behind the anon key.
import { gunzipSync, gzipSync } from "zlib";
import fs from "fs";
import path from "path";
import { getDataDir } from "./paths";
import { MAYHEM_QUEUE_IDS } from "../shared/queues";
import { fetchAllRows, patchFilter } from "../shared/supabase";
import { comparePatches } from "../shared/patch";

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

// One row per augment per patch, rolled up across champions - the grain the
// augment list reads. The per-champion grain behind it is 341k rows and is
// fetched for one augment at a time, when a row is expanded.
export interface CommunityAugmentTotalRow {
  patch: string;
  queue_id: number;
  augment_id: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export interface CommunityItemRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  item_id: number;
  picks: number;
  wins: number;
}

// Two augments run together by the same player. Stored once per unordered
// pair, lower id first.
export interface CommunityAugmentPairRow {
  patch: string;
  queue_id: number;
  augment_a: number;
  augment_b: number;
  picks: number;
  wins: number;
}

// One champion against one opponent. The rollup stores both directions, so
// the rows for a champion are that champion's side of every pairing and wins
// is from that side.
export interface CommunityMatchupRow {
  patch: string;
  queue_id: number;
  opponent_id: number;
  games: number;
  wins: number;
}

// Only the champion grain is cached wholesale - 3.5k rows. The augment and
// item grains are per (patch, queue, champion, thing) and run to well over
// half a million rows between them, so those are fetched for one champion at
// a time, when a champion page asks.
// Bump when the cached shape changes. Without this, a cache written by an
// older build is read back as the current shape and whatever it lacks reads
// as undefined - v2.12.7 added augmentTotals, and a v2.12.6 cache that was
// still inside its six hours left the augment list waiting forever on a
// promise that had already rejected.
const CACHE_VERSION = 3;

interface Cache {
  version?: number;
  fetchedAt: number;
  champions: CommunityChampionRow[];
  augmentTotals: CommunityAugmentTotalRow[];
}

let memory: Cache | null = null;
let inFlight: Promise<Cache> | null = null;

interface ChampionDetailCache {
  fetchedAt: number;
  augments: CommunityAugmentRow[];
  items: CommunityItemRow[];
  matchups: CommunityMatchupRow[];
}

// Champion pages get revisited constantly while comparing builds; holding the
// last handful in memory makes going back and forth free. Not persisted -
// it's a session convenience, not the app's data.
const detailCache = new Map<number, ChampionDetailCache>();
const DETAIL_LIMIT = 24;

const cacheFile = () => path.join(getDataDir(), "community-cache.json.gz");

function readCache(): Cache | null {
  if (memory) return memory;
  try {
    const raw = gunzipSync(fs.readFileSync(cacheFile())).toString("utf8");
    const parsed = JSON.parse(raw) as Cache;
    // An older shape is not stale data, it is the wrong data - refetch
    if (parsed.version !== CACHE_VERSION) return null;
    memory = parsed;
    return memory;
  } catch {
    // No cache yet, or an unreadable one - refetch rather than fail
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

// Long enough that opening the app repeatedly costs nothing, short enough
// that a session's worth of new games shows up the same day
const TTL_MS = 6 * 60 * 60 * 1000;

// Only the columns the app actually reads. augment_stats carries per-augment
// combat lines this never touches, and they dominate its payload.
const CHAMPION_QUERY =
  "select=patch,queue_id,champion_id,games,wins,kills,deaths,assists,damage,damage_taken,heal,gold,pentas" +
  "&order=patch,queue_id,champion_id";
const AUGMENT_QUERY =
  "select=patch,queue_id,augment_id,champion_id,picks,wins&order=patch,queue_id,augment_id";
const AUGMENT_TOTALS_QUERY =
  "select=patch,queue_id,augment_id,picks,wins,kills,deaths,assists,damage" +
  "&order=patch,queue_id,augment_id";
const ITEM_QUERY =
  "select=patch,queue_id,champion_id,item_id,picks,wins&order=patch,queue_id,item_id";
const MATCHUP_QUERY =
  "select=patch,queue_id,opponent_id,games,wins&order=patch,queue_id,opponent_id";
const PAIR_QUERY =
  "select=patch,queue_id,augment_a,augment_b,picks,wins&order=patch,queue_id,augment_a,augment_b";

// Serves the cache when it's fresh, refetches when it isn't, and falls back to
// stale data if the network is unavailable - an offline client should still
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

// How many patches a first launch fetches before the tab can draw. The board
// defaults to the current patch and the filter never reaches past the newest
// few without being asked, so the rest can arrive behind the first paint.
const FIRST_PAINT_PATCHES = 3;

// Newest first, from the patch list rather than from the stat rows, so this
// costs 21 tiny rows rather than the thing it is trying to avoid fetching.
async function recentPatches(): Promise<string[] | undefined> {
  try {
    const rows = await fetchAllRows<{ patch: string }>(
      "community_patch_spans",
      "select=patch&order=patch",
    );
    const sorted = rows.map((r) => r.patch).sort((a, b) => comparePatches(b, a));
    return sorted.length > FIRST_PAINT_PATCHES ? sorted.slice(0, FIRST_PAINT_PATCHES) : undefined;
  } catch {
    // The view is missing or unreachable: fall back to fetching everything,
    // which is what this did before and is never wrong, only slower.
    return undefined;
  }
}

// Fills in the patches the staged first fetch skipped. Runs detached: a
// failure here leaves the partial cache in place, which is marked stale, so
// the next call refetches rather than trusting three patches forever.
async function completeInBackground(): Promise<void> {
  try {
    const [champions, augmentTotals] = await Promise.all([
      fetchAllRows<CommunityChampionRow>("champion_stats", CHAMPION_QUERY),
      fetchAllRows<CommunityAugmentTotalRow>("augment_totals", AUGMENT_TOTALS_QUERY),
    ]);
    writeCache({ version: CACHE_VERSION, fetchedAt: Date.now(), champions, augmentTotals });
    detailCache.clear();
    augmentChampionCache.clear();
  } catch {
    // Partial cache stands; it is already marked stale
  }
}

function refresh(cached: Cache | null = readCache()): Promise<Cache> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // A first launch has no cache, so it waits on this fetch before the
      // Champions tab can draw anything. Fetching the newest few patches makes
      // that wait 34 KB instead of 237 KB; the rest arrives behind it and the
      // six-hour cache means later launches never pay either way.
      if (!cached) {
        const recent = await recentPatches();
        if (recent) {
          const [champions, augmentTotals] = await Promise.all([
            fetchAllRows<CommunityChampionRow>(
              "champion_stats",
              CHAMPION_QUERY + patchFilter(recent),
            ),
            fetchAllRows<CommunityAugmentTotalRow>(
              "augment_totals",
              AUGMENT_TOTALS_QUERY + patchFilter(recent),
            ),
          ]);
          // Marked partial so the next loadCommunity() refetches in full
          // rather than treating three patches as the whole database for six
          // hours.
          const partial: Cache = {
            version: CACHE_VERSION,
            fetchedAt: 0,
            champions,
            augmentTotals,
          };
          writeCache(partial);
          void completeInBackground();
          return partial;
        }
      }

      const [champions, augmentTotals] = await Promise.all([
        fetchAllRows<CommunityChampionRow>("champion_stats", CHAMPION_QUERY),
        fetchAllRows<CommunityAugmentTotalRow>("augment_totals", AUGMENT_TOTALS_QUERY),
      ]);
      const cache: Cache = {
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        champions,
        augmentTotals,
      };
      detailCache.clear();
      augmentChampionCache.clear();
      writeCache(cache);
      return cache;
    } catch (err) {
      if (cached) {
        console.warn(`community: refresh failed (${(err as Error).message}) - serving cache`);
        return cached;
      }
      throw err;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// `patches` undefined means every patch. A set rather than a list: this runs
// once per row, and the champion grain is hundreds of thousands of them.
const matches = (row: { patch: string; queue_id: number }, patches?: Set<string>, queue?: number) =>
  (patches == null || patches.has(row.patch)) &&
  (queue == null ? MAYHEM_QUEUE_IDS.includes(row.queue_id) : row.queue_id === queue);

// Callers hand in the list the renderer computed from the patch selection
const patchSet = (patches?: string[]) => (patches ? new Set(patches) : undefined);

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
  patches?: string[],
  queue?: number,
): Promise<CommunityChampionStats[]> {
  const included = patchSet(patches);
  const { champions } = await loadCommunity();
  const byChampion = new Map<number, CommunityChampionStats>();
  for (const r of champions) {
    if (!matches(r, included, queue)) continue;
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
  // remember - the raw quotient reached the table as 10.633333333333333.
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

  const [augments, items, matchups] = await Promise.all([
    fetchAllRows<CommunityAugmentRow>(
      "augment_stats",
      `${AUGMENT_QUERY}&champion_id=eq.${championId}`,
    ),
    fetchAllRows<CommunityItemRow>("item_stats", `${ITEM_QUERY}&champion_id=eq.${championId}`),
    // The newest of the three rollups, so a client running against a project
    // that has not had the migration yet loses a panel rather than the page
    fetchAllRows<CommunityMatchupRow>(
      "champion_matchups",
      `${MATCHUP_QUERY}&champion_id=eq.${championId}`,
    ).catch(() => [] as CommunityMatchupRow[]),
  ]);

  const entry: ChampionDetailCache = { fetchedAt: Date.now(), augments, items, matchups };
  detailCache.set(championId, entry);
  // Oldest insertion first, so deleting the first key evicts the least
  // recently fetched champion
  if (detailCache.size > DETAIL_LIMIT) {
    detailCache.delete(detailCache.keys().next().value as number);
  }
  return entry;
}

// Every pairing one augment appears in, fetched when a row is expanded. The
// rollup stores each pair once with the lower id first, so both sides have to
// be asked for.
export async function getCommunityAugmentPairs(
  augmentId: number,
  patches?: string[],
  queue?: number,
): Promise<{ augment_a: number; augment_b: number; picks: number; wins: number }[]> {
  const included = patchSet(patches);
  let rows: CommunityAugmentPairRow[];
  try {
    rows = await fetchAllRows<CommunityAugmentPairRow>(
      "augment_pairs",
      `${PAIR_QUERY}&or=(augment_a.eq.${augmentId},augment_b.eq.${augmentId})`,
    );
  } catch {
    // The newest rollup of the lot. A client running against a project that
    // has not had the migration yet loses a section, not the row above it.
    return [];
  }
  const totals = new Map<
    number,
    { augment_a: number; augment_b: number; picks: number; wins: number }
  >();
  for (const r of rows) {
    if (!matches(r, included, queue)) continue;
    const partner = r.augment_a === augmentId ? r.augment_b : r.augment_a;
    const e = totals.get(partner) ?? {
      augment_a: Math.min(augmentId, partner),
      augment_b: Math.max(augmentId, partner),
      picks: 0,
      wins: 0,
    };
    e.picks += r.picks;
    e.wins += r.wins;
    totals.set(partner, e);
  }
  return [...totals.values()].sort((a, b) => b.picks - a.picks);
}

export async function getCommunityChampionDetail(
  championId: number,
  patches?: string[],
  queue?: number,
): Promise<{
  augments: { augment_id: number; picks: number; wins: number }[];
  items: { item_id: number; picks: number; wins: number }[];
  matchups: { opponent_id: number; games: number; wins: number }[];
}> {
  const included = patchSet(patches);
  const { augments, items, matchups } = await loadChampionDetail(championId);
  const augTotals = new Map<number, { augment_id: number; picks: number; wins: number }>();
  for (const r of augments) {
    if (r.champion_id !== championId || !matches(r, included, queue)) continue;
    const e = augTotals.get(r.augment_id) ?? { augment_id: r.augment_id, picks: 0, wins: 0 };
    e.picks += r.picks;
    e.wins += r.wins;
    augTotals.set(r.augment_id, e);
  }
  const itemTotals = new Map<number, { item_id: number; picks: number; wins: number }>();
  for (const r of items) {
    if (r.champion_id !== championId || !matches(r, included, queue)) continue;
    const e = itemTotals.get(r.item_id) ?? { item_id: r.item_id, picks: 0, wins: 0 };
    e.picks += r.picks;
    e.wins += r.wins;
    itemTotals.set(r.item_id, e);
  }
  const matchupTotals = new Map<number, { opponent_id: number; games: number; wins: number }>();
  for (const r of matchups) {
    if (!matches(r, included, queue)) continue;
    const e = matchupTotals.get(r.opponent_id) ?? { opponent_id: r.opponent_id, games: 0, wins: 0 };
    e.games += r.games;
    e.wins += r.wins;
    matchupTotals.set(r.opponent_id, e);
  }
  return {
    augments: [...augTotals.values()].sort((a, b) => b.picks - a.picks),
    items: [...itemTotals.values()].sort((a, b) => b.picks - a.picks),
    matchups: [...matchupTotals.values()].sort((a, b) => b.games - a.games),
  };
}

// The augment list, in the shape the app's local getAugmentStats returns.
export interface CommunityAugmentStats {
  augment_id: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export async function getCommunityAugmentStats(
  patches?: string[],
  queue?: number,
): Promise<CommunityAugmentStats[]> {
  const included = patchSet(patches);
  const { augmentTotals } = await loadCommunity();
  const byAugment = new Map<number, CommunityAugmentStats>();
  for (const r of augmentTotals ?? []) {
    if (!matches(r, included, queue)) continue;
    let e = byAugment.get(r.augment_id);
    if (!e) {
      e = {
        augment_id: r.augment_id,
        picks: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
      };
      byAugment.set(r.augment_id, e);
    }
    e.picks += r.picks;
    e.wins += r.wins;
    e.kills += r.kills ?? 0;
    e.deaths += r.deaths ?? 0;
    e.assists += r.assists ?? 0;
    e.damage += r.damage ?? 0;
  }
  return [...byAugment.values()].sort((a, b) => b.picks - a.picks);
}

// Which champions carry one augment, for an expanded row. Filtered server-side
// on an indexed column, so this is a couple of thousand rows rather than the
// whole 341k grain.
const augmentChampionCache = new Map<number, { fetchedAt: number; rows: CommunityAugmentRow[] }>();

export async function getCommunityAugmentChampions(
  augmentId: number,
  patches?: string[],
  queue?: number,
): Promise<{ champion_id: number; picks: number; wins: number }[]> {
  const included = patchSet(patches);
  let hit = augmentChampionCache.get(augmentId);
  if (!hit || Date.now() - hit.fetchedAt >= TTL_MS) {
    const rows = await fetchAllRows<CommunityAugmentRow>(
      "augment_stats",
      `${AUGMENT_QUERY}&augment_id=eq.${augmentId}`,
    );
    hit = { fetchedAt: Date.now(), rows };
    augmentChampionCache.set(augmentId, hit);
    if (augmentChampionCache.size > DETAIL_LIMIT) {
      augmentChampionCache.delete(augmentChampionCache.keys().next().value as number);
    }
  }
  const byChampion = new Map<number, { champion_id: number; picks: number; wins: number }>();
  for (const r of hit.rows) {
    if (!matches(r, included, queue)) continue;
    const e = byChampion.get(r.champion_id) ?? { champion_id: r.champion_id, picks: 0, wins: 0 };
    e.picks += r.picks;
    e.wins += r.wins;
    byChampion.set(r.champion_id, e);
  }
  return [...byChampion.values()].sort((a, b) => b.picks - a.picks);
}

// Patches present in the community data, newest first - the app's patch
// filter offers these when the community source is selected, since the local
// database's patch list can be a subset (or, on a fresh install, empty)
export async function getCommunityMeta(): Promise<{
  fetchedAt: number;
  patches: string[];
  queues: number[];
  games: number;
}> {
  const { champions, fetchedAt } = await loadCommunity();
  const patches = [...new Set((champions ?? []).map((r) => r.patch))].sort((a, b) => {
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
