import type { AugmentStatRow, ChampionStatRow } from "./api";

// Win rates below this many games render muted instead of colored, so a 3-0
// augment doesn't outshine a 60% one with 200 picks
export const MIN_SAMPLE = 20;

// Tier badges render dimmed below this many games
export const TIER_MIN_SAMPLE = 10;

export const QUEUE_LABELS: Record<number, string> = {
  2400: "ARAM Mayhem",
  2450: "Mayhem Classic",
};

export interface Filters {
  patch?: string;
  queue?: number;
}

function rowMatches(row: { patch: string; queue_id: number }, f: Filters): boolean {
  if (f.patch && row.patch !== f.patch) return false;
  if (f.queue != null && row.queue_id !== f.queue) return false;
  return true;
}

// Patches present in the data, newest first
export function availablePatches(rows: ChampionStatRow[]): string[] {
  const set = new Set(rows.map((r) => r.patch));
  return Array.from(set).sort((a, b) => {
    const [aMajor, aMinor] = a.split(".").map(Number);
    const [bMajor, bMinor] = b.split(".").map(Number);
    return bMajor - aMajor || bMinor - aMinor;
  });
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

export function aggregateAugments(rows: AugmentStatRow[], f: Filters): AugmentAgg[] {
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
  return Array.from(map.values()).sort((a, b) => b.picks - a.picks);
}

// Per-augment breakdown of one champion (for expanded champion rows)
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
  return Array.from(map.values()).sort((a, b) => b.picks - a.picks);
}

// ---- Score & tiers ----

// Bayesian shrinkage: blend the observed win rate with a 50% prior worth
// PRIOR_GAMES of games, so a 3-0 entry lands mid-pack instead of topping the
// tier list while a 60% entry with 200 games keeps most of its edge.
const PRIOR_GAMES = 20;

export function score(wins: number, games: number): number {
  return (100 * (wins + PRIOR_GAMES * 0.5)) / (games + PRIOR_GAMES);
}

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

export function kdaRatio(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(deaths, 1);
}

export function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
