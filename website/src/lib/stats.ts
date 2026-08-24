import type { AugmentStatRow, AugmentTotalRow, ChampionStatRow } from "./api";

// Win rates below this many games render muted instead of colored, so a 3-0
// augment doesn't outshine a 60% one with 200 picks
export const MIN_SAMPLE = 20;

// Tier badges render dimmed below this many games
export const TIER_MIN_SAMPLE = 10;

// The long-tail item and augment lists hide anything under this many picks.
// The confidence score already sinks a two-pick record to the bottom rather
// than the top, so this is now about noise rather than ranking: a row that
// says 100% over two games is a distraction whatever it sorts as. The build
// panels above them use their own, stricter floors.
export const LIST_MIN_PICKS = 5;

export const QUEUE_LABELS: Record<number, string> = {
  2400: "ARAM Mayhem",
  2450: "Mayhem Classic",
};

export interface Filters {
  // Undefined means all patches; otherwise the set of included patches
  patches?: Set<string>;
  queue?: number;
}

function rowMatches(row: { patch: string; queue_id: number }, f: Filters): boolean {
  if (f.patches && !f.patches.has(row.patch)) return false;
  if (f.queue != null && row.queue_id !== f.queue) return false;
  return true;
}

export function comparePatches(a: string, b: string): number {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

// Patches are stored year-based ("26.16") since the community database was
// normalized; mapping again here is a harmless safety net for any stray
// client-style value ("16.16") — client majors stay below 25 until 2035,
// so the shift is idempotent.
export function formatPatch(patch: string): string {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${m[2]}` : patch;
}

// Patches present in the data, newest first
export function availablePatches(rows: ChampionStatRow[]): string[] {
  const set = new Set(rows.map((r) => r.patch));
  return Array.from(set).sort((a, b) => comparePatches(b, a));
}

export function availableQueues(rows: ChampionStatRow[]): number[] {
  return Array.from(new Set(rows.map((r) => r.queue_id))).sort();
}

export interface ChampionAgg {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  pentas: number;
}

export function aggregateChampions(rows: ChampionStatRow[], f: Filters): ChampionAgg[] {
  const map = new Map<number, ChampionAgg>();
  for (const r of rows) {
    if (!rowMatches(r, f)) continue;
    let e = map.get(r.champion_id);
    if (!e) {
      map.set(
        r.champion_id,
        (e = {
          champion_id: r.champion_id,
          games: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
          pentas: 0,
        }),
      );
    }
    e.games += r.games;
    e.wins += r.wins;
    e.kills += r.kills;
    e.deaths += r.deaths;
    e.assists += r.assists;
    e.damage += r.damage;
    e.pentas += r.pentas;
  }
  return Array.from(map.values());
}

export interface AugmentAgg {
  augment_id: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export function aggregateAugments(rows: AugmentTotalRow[], f: Filters): AugmentAgg[] {
  const map = new Map<number, AugmentAgg>();
  for (const r of rows) {
    if (!rowMatches(r, f)) continue;
    let e = map.get(r.augment_id);
    if (!e) {
      map.set(
        r.augment_id,
        (e = {
          augment_id: r.augment_id,
          picks: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
        }),
      );
    }
    e.picks += r.picks;
    e.wins += r.wins;
    e.kills += r.kills;
    e.deaths += r.deaths;
    e.assists += r.assists;
    e.damage += r.damage;
  }
  return Array.from(map.values());
}

// Per-champion breakdown of one augment (for expanded augment rows)
export function augmentChampionBreakdown(
  rows: AugmentStatRow[],
  f: Filters,
  augmentId: number,
): { champion_id: number; picks: number; wins: number }[] {
  const map = new Map<number, { champion_id: number; picks: number; wins: number }>();
  for (const r of rows) {
    if (r.augment_id !== augmentId || !rowMatches(r, f)) continue;
    let e = map.get(r.champion_id);
    if (!e) map.set(r.champion_id, (e = { champion_id: r.champion_id, picks: 0, wins: 0 }));
    e.picks += r.picks;
    e.wins += r.wins;
  }
  return Array.from(map.values()).sort((a, b) => score(b.wins, b.picks) - score(a.wins, a.picks));
}

// Per-augment breakdown of one champion (for expanded champion rows)
// These breakdowns rank by confidence score, not by how often something was
// built. Sorting by picks put the most *popular* entry at the top of a list
// that reads as "what works" — a different question, and one the pick count
// in each row already answers.
export function championAugmentBreakdown(
  rows: AugmentStatRow[],
  f: Filters,
  championId: number,
): { augment_id: number; picks: number; wins: number }[] {
  const map = new Map<number, { augment_id: number; picks: number; wins: number }>();
  for (const r of rows) {
    if (r.champion_id !== championId || !rowMatches(r, f)) continue;
    let e = map.get(r.augment_id);
    if (!e) map.set(r.augment_id, (e = { augment_id: r.augment_id, picks: 0, wins: 0 }));
    e.picks += r.picks;
    e.wins += r.wins;
  }
  return Array.from(map.values()).sort((a, b) => score(b.wins, b.picks) - score(a.wins, a.picks));
}

// Item picks for one champion (for the champion detail view)
export function championItemBreakdown(
  rows: import("./api").ItemStatRow[],
  f: Filters,
  championId: number,
): { item_id: number; picks: number; wins: number }[] {
  const map = new Map<number, { item_id: number; picks: number; wins: number }>();
  for (const r of rows) {
    if (r.champion_id !== championId || !rowMatches(r, f)) continue;
    let e = map.get(r.item_id);
    if (!e) map.set(r.item_id, (e = { item_id: r.item_id, picks: 0, wins: 0 }));
    e.picks += r.picks;
    e.wins += r.wins;
  }
  return Array.from(map.values()).sort((a, b) => score(b.wins, b.picks) - score(a.wins, a.picks));
}

// Poro-Snax (base and upgraded) is handed out for free, so it would show up
// as an early "purchase" for every champion. The uploaded item_stats view
// already drops it; the live purchase feed doesn't, so filter it here.
const EXCLUDED_ITEM_IDS = new Set([2052, 220013]);

// Typical build path: items merged across the filtered patches with a
// picks-weighted average first-buy time — sorting by that time reads as the
// order the champion usually builds in.
export function championBuildPath(
  rows: import("./api").ItemPurchaseRow[],
  f: Filters,
  championId: number,
): { item_id: number; picks: number; wins: number; avgBuyS: number }[] {
  const map = new Map<number, { item_id: number; picks: number; wins: number; timeSum: number }>();
  for (const r of rows) {
    if (r.champion_id !== championId || !rowMatches(r, f)) continue;
    if (EXCLUDED_ITEM_IDS.has(r.item_id)) continue;
    let e = map.get(r.item_id);
    if (!e) map.set(r.item_id, (e = { item_id: r.item_id, picks: 0, wins: 0, timeSum: 0 }));
    e.picks += r.picks;
    e.wins += r.wins;
    e.timeSum += r.avg_first_buy_s * r.picks;
  }
  return Array.from(map.values())
    .map((e) => ({
      item_id: e.item_id,
      picks: e.picks,
      wins: e.wins,
      avgBuyS: e.picks > 0 ? e.timeSum / e.picks : 0,
    }))
    .sort((a, b) => a.avgBuyS - b.avgBuyS);
}

// The "ideal build" ranking. A build entry has to earn its place twice: a
// workable sample, and a record that isn't losing. Ranking is by confidence
// score, so a solid 58% over hundreds of games beats a lucky 100% over five.
//
// This used to pad the list with the most-picked entries when nothing
// qualified, which meant a champion with thin data got a "core build" made of
// items that had never won a game — presenting coverage as a recommendation.
// Falling short of `count` now says so, and the caller shows an empty state.
export function rankForBuild<T>(
  list: T[],
  getPicks: (t: T) => number,
  getWins: (t: T) => number,
  minPicks: number,
  count: number,
): T[] {
  return list
    .filter((x) => {
      const picks = getPicks(x);
      return picks >= minPicks && getWins(x) * 2 >= picks;
    })
    .sort((a, b) => score(getWins(b), getPicks(b)) - score(getWins(a), getPicks(a)))
    .slice(0, count);
}

// ---- Score & tiers ----

// Score: the one number every ranking on the site is built from, out of 100.
//
// It is the lower bound of the Wilson interval at 95% — read it as "the win
// rate this record supports". A perfect 5-0 scores 56.6, because five games
// cannot rule out a coin flip; 60.1% over 2,635 games scores 58.2, because
// that many games can. Sample size moves the number on its own, so an entry
// climbs as it proves itself rather than arriving at the top and sliding down,
// and every score sits below the raw win rate by however much doubt is left.
//
// This replaced a shrunk win rate — the observed rate blended with a 50% prior
// worth twenty games — which champions, augments and items all used to rank
// by. It failed the case it existed for: a 5-0 item and a 60.1% one over 2,635
// games both scored 60.0, a tie at 500x the evidence. The two formulas ran
// side by side for a while, one for champions and one for the item and augment
// lists, which meant one word for two numbers; this is the whole site on the
// interval.
const WILSON_Z = 1.96;

export function score(wins: number, games: number): number {
  if (games <= 0) return 0;
  const p = wins / games;
  const z2 = WILSON_Z * WILSON_Z;
  const denominator = 1 + z2 / games;
  const centre = p + z2 / (2 * games);
  const margin = WILSON_Z * Math.sqrt((p * (1 - p) + z2 / (4 * games)) / games);
  return (100 * (centre - margin)) / denominator;
}

export type Tier = "S+" | "S" | "A" | "B" | "C" | "D";

// The unified performance ramp for KDA ratios: amber ≥5, sky ≥4, emerald ≥3,
// slate below — shared visual language with the desktop app's score colors.
export function kdaRampClass(ratio: number): string {
  if (ratio >= 5) return "text-amber-400";
  if (ratio >= 4) return "text-sky-400";
  if (ratio >= 3) return "text-emerald-400";
  return "text-lol-text";
}

// Best to worst. Sorting a table by its tier column orders against this.
export const TIER_ORDER: Tier[] = ["S+", "S", "A", "B", "C", "D"];

// Rank-percentile cutoffs, top to bottom
const TIER_CUTOFFS: [Tier, number][] = [
  ["S+", 0.05],
  ["S", 0.15],
  ["A", 0.35],
  ["B", 0.65],
  ["C", 0.85],
  ["D", 1.01],
];

// Tiers by score rank within a cohort (all champions, or augments of one
// rarity). Relative by design: the current meta always has an S+ and a D.
export function assignTiers<T>(
  items: T[],
  getScore: (t: T) => number,
  getKey: (t: T) => number,
): Map<number, Tier> {
  const sorted = [...items].sort((a, b) => getScore(b) - getScore(a));
  const tiers = new Map<number, Tier>();
  sorted.forEach((item, i) => {
    const pct = (i + 1) / sorted.length;
    const tier = TIER_CUTOFFS.find(([, cut]) => pct <= cut)![0];
    tiers.set(getKey(item), tier);
  });
  return tiers;
}

export function kdaRatio(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(deaths, 1);
}

export function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
