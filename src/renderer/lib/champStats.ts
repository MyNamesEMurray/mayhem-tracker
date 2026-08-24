// Champion, item and augment ranking, ported from the website's
// src/lib/stats.ts so the app reads the same as mayhemstats.com. Keep the two
// in sync: the score formula and tier cutoffs are the site's published
// methodology, and a number that differs between the two surfaces is worse
// than no number.

// Score: the one number every ranking here and on the site is built from, out
// of 100. It is the lower bound of the Wilson interval at 95% — read it as
// "the win rate this record supports".
//
// A perfect 5-0 scores 56.6, because five games cannot rule out a coin flip;
// 60.1% over 2,635 games scores 58.2, because that many games can. Sample size
// moves the number on its own, so an entry climbs as it proves itself rather
// than arriving at the top and sliding down.
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

// Win rates below this many games render muted; tier badges dim below 10
export const MIN_SAMPLE = 20;
export const TIER_MIN_SAMPLE = 10;

// The long-tail lists hide anything under this many picks. The confidence
// score already sinks a two-pick record to the bottom rather than the top, so
// this is about noise rather than ranking: a row reading 100% over two games
// is a distraction whatever it sorts as.
export const LIST_MIN_PICKS = 5;

export type Tier = "S+" | "S" | "A" | "B" | "C" | "D";

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

// A build entry has to earn its place twice: a workable sample, and a record
// that isn't losing. Ranked by confidence score, so a solid 58% over hundreds
// of games beats a lucky 100% over five. No popularity filler — an item that
// has never won is not a recommendation, however many times it was built.
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

export function winRate(wins: number, total: number): number {
  return total > 0 ? (wins / total) * 100 : 0;
}
