import { toYearPatch } from "../../shared/patch";
import { KDA_RAMP, rampClass, SCORE_RAMP } from "../../shared/format";

// Re-exported so call sites keep one formatting import
export { formatWhole } from "../../shared/format";

// Per-game averages. K/D/A-sized numbers carry one decimal — always, so a
// column reads 13.6 / 12.5 / 14.0 rather than 13.6 / 12.5 / 14 — and the big
// ones (damage, gold) are whole with separators.
//
// Both stat sources round at the source (SQL ROUND in db.ts, and the same
// values rounded in main/community.ts). Formatting here as well means a table
// can never print 10.633333333333333 if a future source forgets.
export function formatAvg(value: number | null | undefined): string {
  return (value ?? 0).toFixed(1);
}

export function formatKDA(kills: number, deaths: number, assists: number): string {
  return `${kills} / ${deaths} / ${assists}`;
}

export function kdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}

// The performance ramp, from src/shared/format.ts — the same one the site
// colours its KDA column with.
export function kdaColor(ratio: number): string {
  return rampClass(ratio, KDA_RAMP);
}

// Same ramp for a formatted kdaRatio() string ("Perfect" counts as top tier)
export function kdaStringColor(kda: string): string {
  return kdaColor(kda === "Perfect" ? Infinity : parseFloat(kda));
}

// The same ramp on the 1-10 match score's thresholds.
export function scoreRampColor(score: number): string {
  return rampClass(score, SCORE_RAMP);
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// When a specific game was played, as a clock time rather than an age. Used on
// match rows, where "3d ago" doesn't help you find the session you remember;
// "how long ago" is still the right thing for last-activity summaries.
// The year shows only when it isn't the current one, so the common case stays
// short. Locale-aware, so this reads naturally outside the US too.
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

// Patches are stored year-based ("26.16") since the database migration;
// mapping here again is a harmless safety net for any stray client-style
// value ("16.16"), since toYearPatch is idempotent.
export function formatPatch(patch: string): string {
  return toYearPatch(patch);
}
