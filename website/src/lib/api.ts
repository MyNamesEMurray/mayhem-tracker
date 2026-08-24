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

// PostgREST historically defaults to 1000 rows. The stats are now backed by
// indexed materialized aggregates, so use larger pages to avoid hundreds of
// sequential HTTP requests for the augment/item long tail.
async function fetchAll<T>(view: string): Promise<T[]> {
  const PAGE = 10_000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to load ${view} (HTTP ${res.status})`);
    }
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export function fetchChampionStats(): Promise<ChampionStatRow[]> {
  return fetchAll<ChampionStatRow>("champion_stats");
}

export function fetchAugmentStats(): Promise<AugmentStatRow[]> {
  return fetchAll<AugmentStatRow>("augment_stats");
}

export function fetchItemStats(): Promise<ItemStatRow[]> {
  return fetchAll<ItemStatRow>("item_stats");
}

export function fetchItemPurchaseStats(): Promise<ItemPurchaseRow[]> {
  return fetchAll<ItemPurchaseRow>("item_purchase_stats");
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
