// Read-only access to the community stats project. The key is the project's
// public client credential: raw tables are locked behind row level security,
// and these aggregate views are the only readable surface.
const SUPABASE_URL = "https://lmzenzxbhotszvwsnhlm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtemVuenhiaG90c3p2d3NuaGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjU0NDcsImV4cCI6MjEwMTgwMTQ0N30.7FoFD7LFaV5Yin4OnjYjECAYZPa2I9xc6oQa4xPAKpA";

export interface ChampionStatRow {
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

export interface AugmentStatRow {
  patch: string;
  queue_id: number;
  augment_id: number;
  champion_id: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

// The Augments tab's grain: one row per augment per patch, rolled up across
// champions. The per-champion rows are 341k and growing — two orders of
// magnitude more than this — so they are fetched per champion, on demand.
export interface AugmentTotalRow {
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

export interface ItemStatRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  item_id: number;
  picks: number;
  wins: number;
}

// From live build-order tracking: how many participants bought the item and
// how early on average
export interface ItemPurchaseRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  item_id: number;
  picks: number;
  wins: number;
  avg_first_buy_s: number;
}

// PostgREST caps a response at 1000 rows on this project — verified: asking
// for 0-9999 comes back "content-range: 0-999/*" with a thousand rows. A
// larger page size doesn't fetch more, it just makes the walk stop after the
// first page and silently truncate every view. So pages stay at 1000 and the
// first request asks for an exact count instead, which lets the rest of them
// go out together rather than one after another.
const PAGE = 1000;

async function fetchPage<T>(
  view: string,
  query: string,
  from: number,
  withCount: boolean,
): Promise<{ rows: T[]; total: number | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Range: `${from}-${from + PAGE - 1}`,
      ...(withCount ? { Prefer: "count=exact" } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to load ${view} (HTTP ${res.status})`);
  }
  const rows = (await res.json()) as T[];
  // "0-999/3562" — the total is what lets the rest of the pages be parallel
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  return { rows, total: Number.isFinite(total) ? total : null };
}

async function fetchAll<T>(view: string, query = "select=*"): Promise<T[]> {
  const first = await fetchPage<T>(view, query, 0, true);
  if (first.rows.length < PAGE) return first.rows;

  if (first.total == null) {
    // No count header: walk pages until one comes up short
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

export function fetchChampionStats(): Promise<ChampionStatRow[]> {
  return fetchAll<ChampionStatRow>("champion_stats");
}

export function fetchAugmentTotals(): Promise<AugmentTotalRow[]> {
  return fetchAll<AugmentTotalRow>("augment_totals");
}

// Everything below is per-champion or per-augment, fetched when a page that
// needs it opens. Filtering server-side keeps a champion page to a couple of
// thousand rows instead of the half-million the full grain would cost.
export function fetchChampionAugments(championId: number): Promise<AugmentStatRow[]> {
  return fetchAll<AugmentStatRow>("augment_stats", `select=*&champion_id=eq.${championId}`);
}

export function fetchChampionItems(championId: number): Promise<ItemStatRow[]> {
  return fetchAll<ItemStatRow>("item_stats", `select=*&champion_id=eq.${championId}`);
}

export function fetchChampionPurchases(championId: number): Promise<ItemPurchaseRow[]> {
  return fetchAll<ItemPurchaseRow>(
    "item_purchase_stats",
    `select=*&champion_id=eq.${championId}`,
  );
}

// For an expanded augment row: which champions carry it
export function fetchAugmentChampions(augmentId: number): Promise<AugmentStatRow[]> {
  return fetchAll<AugmentStatRow>("augment_stats", `select=*&augment_id=eq.${augmentId}`);
}

export interface CommunityTotals {
  games: number;
  contributors: number;
  total_seconds: number;
  patches: number;
  first_game_ms: number | null;
  last_game_ms: number | null;
}

export interface GamesPerDayRow {
  day: string;
  games: number;
}

// When each patch was first and last seen in a contributed game. Riot
// publishes no patch-date endpoint, so these are observed boundaries: the
// first game someone played on a version, which trails the actual deploy.
export interface PatchSpanRow {
  patch: string;
  first_seen: string;
  last_seen: string;
  games: number;
}

export async function fetchCommunityTotals(): Promise<CommunityTotals> {
  const rows = await fetchAll<CommunityTotals>("community_totals");
  return (
    rows[0] ?? {
      games: 0,
      contributors: 0,
      total_seconds: 0,
      patches: 0,
      first_game_ms: null,
      last_game_ms: null,
    }
  );
}

export function fetchGamesPerDay(): Promise<GamesPerDayRow[]> {
  return fetchAll<GamesPerDayRow>("community_games_per_day");
}

// Patch markers decorate the games chart; the chart is fine without them, so
// a missing view or any other failure yields no markers rather than taking
// the whole page down with an error.
export async function fetchPatchSpans(): Promise<PatchSpanRow[]> {
  try {
    return await fetchAll<PatchSpanRow>("community_patch_spans");
  } catch {
    return [];
  }
}

// How many distinct champion-vs-champion matchups the database has seen, and
// how many champions have appeared — the denominator (every unordered pair,
// mirror matchups included) is derived from the second.
export interface MatchupCoverage {
  matchups: number;
  champions: number;
}

export async function fetchMatchupCoverage(): Promise<MatchupCoverage | null> {
  try {
    const rows = await fetchAll<MatchupCoverage>("matchup_coverage");
    return rows[0] ?? null;
  } catch {
    // The tile falls back to a dash rather than taking the page down with it
    return null;
  }
}
