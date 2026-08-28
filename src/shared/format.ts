// Number and colour formatting shared by the desktop app and mayhemstats.com.
// Anything here has to read the same on both surfaces; the app's per-surface
// helpers (durations, timestamps, the "Perfect" KDA label) stay in
// src/renderer/lib/format.ts.

// Whole numbers carry a thousands separator, everywhere, on both surfaces.
// The site used to render "50.6k", which is shorter and reads as an estimate -
// and disagreed with the app, which has always shown 50,580.
export function formatWhole(value: number | null | undefined): string {
  return Math.round(value ?? 0).toLocaleString();
}

// The numeric KDA ratio. Deaths floor at 1 so a deathless line is a number
// rather than a division by zero; the app wraps this to print "Perfect".
export function kdaRatio(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(deaths, 1);
}

// The performance ramp - design rule 3. Amber, then sky, then emerald, then
// the muted text token. Gold is never used here: gold means brand,
// interaction, and "you".
//
// One ramp, two sets of thresholds. It reads the same whether the number is a
// KDA ratio or a 1-10 match score, which is the point - a colour means the
// same thing wherever it appears.
const RAMP = ["text-amber-400", "text-sky-400", "text-emerald-400"] as const;
const MUTED = "text-lol-text";

export type RampThresholds = readonly [high: number, mid: number, low: number];

// KDA ratios: amber ≥5, sky ≥4, emerald ≥3
export const KDA_RAMP: RampThresholds = [5, 4, 3];

// The 1-10 match score: amber ≥9, sky ≥7, emerald ≥5
export const SCORE_RAMP: RampThresholds = [9, 7, 5];

export function rampClass(value: number, thresholds: RampThresholds): string {
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) return RAMP[i];
  }
  return MUTED;
}
