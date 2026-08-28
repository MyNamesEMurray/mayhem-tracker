// Read-only access to the community stats project. The connection details and
// the paging loop live in src/shared/supabase.ts, which the desktop app reads
// through too.
import { fetchAllRows, patchFilter } from "../../../src/shared/supabase.ts";

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
// champions. The per-champion rows are 341k and growing - two orders of
// magnitude more than this - so they are fetched per champion, on demand.
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

// Undefined means every patch, which is what "All patches" asks for and what
// nothing else should. The board only ever renders a handful, so pulling the
// rest is bytes nobody reads: 21 patches cost 237 KB gzipped against 12 KB for
// the current one, and that gap widens by about 11 KB with every patch Riot
// ships.
export function fetchChampionStats(patches?: string[]): Promise<ChampionStatRow[]> {
  return fetchAllRows<ChampionStatRow>(
    "champion_stats",
    `select=*&order=patch,queue_id,champion_id${patchFilter(patches)}`,
  );
}

export async function fetchAugmentTotals(patches?: string[]): Promise<AugmentTotalRow[]> {
  try {
    return await fetchAllRows<AugmentTotalRow>(
      "augment_totals",
      `select=*&order=patch,queue_id,augment_id${patchFilter(patches)}`,
    );
  } catch (err) {
    // The rollup is one migration behind the client during a deploy. An empty
    // augment tab is a bad half-hour; taking the champion tier list down with
    // it - which is what letting this reject would do - is worse.
    console.warn(`augment_totals unavailable: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// Everything below is per-champion or per-augment, fetched when a page that
// needs it opens. Filtering server-side keeps a champion page to a couple of
// thousand rows instead of the half-million the full grain would cost.
export function fetchChampionAugments(championId: number): Promise<AugmentStatRow[]> {
  return fetchAllRows<AugmentStatRow>(
    "augment_stats",
    `select=*&champion_id=eq.${championId}&order=patch,queue_id,augment_id`,
  );
}

export function fetchChampionItems(championId: number): Promise<ItemStatRow[]> {
  return fetchAllRows<ItemStatRow>(
    "item_stats",
    `select=*&champion_id=eq.${championId}&order=patch,queue_id,item_id`,
  );
}

export function fetchChampionPurchases(championId: number): Promise<ItemPurchaseRow[]> {
  return fetchAllRows<ItemPurchaseRow>(
    "item_purchase_stats",
    `select=*&champion_id=eq.${championId}&order=patch,queue_id,item_id`,
  );
}

export interface MatchupStatRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  opponent_id: number;
  games: number;
  wins: number;
}

// Every opponent this champion has faced, per patch. About 170 opponents per
// patch per queue, so one champion is a page or two where the whole rollup is
// half a million rows - the same reason augments are fetched per champion.
export function fetchChampionMatchups(
  championId: number,
  patches?: string[],
): Promise<MatchupStatRow[]> {
  return fetchAllRows<MatchupStatRow>(
    "champion_matchups",
    `select=*&champion_id=eq.${championId}&order=patch,queue_id,opponent_id${patchFilter(patches)}`,
  );
}

// For an expanded augment row: which champions carry it
export function fetchAugmentChampions(augmentId: number): Promise<AugmentStatRow[]> {
  return fetchAllRows<AugmentStatRow>(
    "augment_stats",
    `select=*&augment_id=eq.${augmentId}&order=patch,queue_id,champion_id`,
  );
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
  const rows = await fetchAllRows<CommunityTotals>("community_totals");
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
  return fetchAllRows<GamesPerDayRow>("community_games_per_day", "select=*&order=day");
}

// Patch markers decorate the games chart; the chart is fine without them, so
// a missing view or any other failure yields no markers rather than taking
// the whole page down with an error.
export async function fetchPatchSpans(): Promise<PatchSpanRow[]> {
  try {
    return await fetchAllRows<PatchSpanRow>("community_patch_spans", "select=*&order=patch");
  } catch {
    return [];
  }
}

// How many distinct champion-vs-champion matchups the database has seen, and
// how many champions have appeared - the denominator (every unordered pair,
// mirror matchups included) is derived from the second.
export interface MatchupCoverage {
  matchups: number;
  champions: number;
}

export async function fetchMatchupCoverage(): Promise<MatchupCoverage | null> {
  try {
    const rows = await fetchAllRows<MatchupCoverage>("matchup_coverage");
    return rows[0] ?? null;
  } catch {
    // The tile falls back to a dash rather than taking the page down with it
    return null;
  }
}
