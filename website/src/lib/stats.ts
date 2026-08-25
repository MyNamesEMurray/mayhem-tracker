import type { AugmentStatRow, AugmentTotalRow, ChampionStatRow } from "./api";

// Score, tiers and the sample-size floors live in src/shared/score.ts, which
// the desktop app imports from too — the site's build root is website/, but
// the repository is checked out whole, so the import resolves in dev, in the
// production build, and in the prerender pass alike. Re-exported here so the
// call sites below and in components/ keep importing from one place.
//
// Written with the .ts extension so plain Node resolves it too — Vite and tsc
// are happy either way, but test/stats.test.mts loads this file directly to
// check the re-export still points at the shared module.
export {
  assignTiers,
  LIST_MIN_PICKS,
  MIN_SAMPLE,
  rankForBuild,
  score,
  TIER_MIN_SAMPLE,
  TIER_ORDER,
  winRate,
} from "../../../src/shared/score.ts";
export type { Tier } from "../../../src/shared/score.ts";

import { score } from "../../../src/shared/score.ts";

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

// The unified performance ramp for KDA ratios: amber ≥5, sky ≥4, emerald ≥3,
// slate below — shared visual language with the desktop app's score colors.
export function kdaRampClass(ratio: number): string {
  if (ratio >= 5) return "text-amber-400";
  if (ratio >= 4) return "text-sky-400";
  if (ratio >= 3) return "text-emerald-400";
  return "text-lol-text";
}

export function kdaRatio(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(deaths, 1);
}

// Whole numbers carry a thousands separator, everywhere, on both surfaces.
// This used to render "50.6k", which is shorter and reads as an estimate —
// and disagreed with the desktop app, which has always shown 50,580.
export function formatWhole(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString();
}
