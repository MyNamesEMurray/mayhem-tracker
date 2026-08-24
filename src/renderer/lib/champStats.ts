// Champion ranking, ported from the website's src/lib/stats.ts so the app's
// champion view reads the same as mayhemstats.com. Keep the two in sync: the
// score formula and tier cutoffs are the site's published methodology, and a
// number that differs between the two surfaces is worse than no number.

// Bayesian shrinkage: blend the observed win rate with a 50% prior worth this
// many games, so a 3-0 entry lands mid-pack instead of topping the list while
// a 60% entry over 200 games keeps most of its edge.
const PRIOR_GAMES = 20;

export function score(wins: number, games: number): number {
  return (100 * (wins + PRIOR_GAMES * 0.5)) / (games + PRIOR_GAMES);
}

// Win rates below this many games render muted; tier badges dim below 10
export const MIN_SAMPLE = 20;
export const TIER_MIN_SAMPLE = 10;

// The long-tail lists hide anything under this many picks. Ranking is by
// shrunk win rate, and at two or three picks a perfect record still edges out
// a solid one over thirty games — so rows too thin to rank don't compete,
// rather than re-tuning the prior behind every score on the site.
export const LIST_MIN_PICKS = 5;

export type Tier = "S+" | "S" | "A" | "B" | "C" | "D";

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
// that isn't losing. Ranked by shrunk win rate, so a confident 58% beats a
// lucky 100% over three games. No popularity filler — an item that has never
// won is not a recommendation, however many times it was built.
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
