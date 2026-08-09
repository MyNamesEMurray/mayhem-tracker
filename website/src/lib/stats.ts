import type { AugmentStatRow, ChampionStatRow } from "./api";

// Win rates below this many games render muted instead of colored, so a 3-0
// augment doesn't outshine a 60% one with 200 picks
export const MIN_SAMPLE = 20;

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
}

export function aggregateChampions(rows: ChampionStatRow[], f: Filters): ChampionAgg[] {
  const map = new Map<number, ChampionAgg>();
  for (const r of rows) {
    if (!rowMatches(r, f)) continue;
    let e = map.get(r.champion_id);
    if (!e) map.set(r.champion_id, (e = { champion_id: r.champion_id, games: 0, wins: 0 }));
    e.games += r.games;
    e.wins += r.wins;
  }
  return Array.from(map.values());
}

export interface AugmentAgg {
  augment_id: number;
  picks: number;
  wins: number;
}

export function aggregateAugments(rows: AugmentStatRow[], f: Filters): AugmentAgg[] {
  const map = new Map<number, AugmentAgg>();
  for (const r of rows) {
    if (!rowMatches(r, f)) continue;
    let e = map.get(r.augment_id);
    if (!e) map.set(r.augment_id, (e = { augment_id: r.augment_id, picks: 0, wins: 0 }));
    e.picks += r.picks;
    e.wins += r.wins;
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
): AugmentAgg[] {
  const map = new Map<number, AugmentAgg>();
  for (const r of rows) {
    if (r.champion_id !== championId || !rowMatches(r, f)) continue;
    let e = map.get(r.augment_id);
    if (!e) map.set(r.augment_id, (e = { augment_id: r.augment_id, picks: 0, wins: 0 }));
    e.picks += r.picks;
    e.wins += r.wins;
  }
  return Array.from(map.values()).sort((a, b) => b.picks - a.picks);
}
