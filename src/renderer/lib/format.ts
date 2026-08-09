export function formatKDA(kills: number, deaths: number, assists: number): string {
  return `${kills} / ${deaths} / ${assists}`;
}

export function kdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}

// Unified performance ramp (design rule 3): amber ≥5 · sky ≥4 · emerald ≥3 ·
// muted below. KDA is never gold — gold means brand/interaction/"you".
export function kdaColor(ratio: number): string {
  if (ratio >= 5) return "text-amber-400";
  if (ratio >= 4) return "text-sky-400";
  if (ratio >= 3) return "text-emerald-400";
  return "text-lol-text";
}

// Same ramp for a formatted kdaRatio() string ("Perfect" counts as top tier)
export function kdaStringColor(kda: string): string {
  return kdaColor(kda === "Perfect" ? Infinity : parseFloat(kda));
}

// Performance ramp for the 1-10 match score (design rule 3). Mirrors the
// thresholds in shared/opScore but bottoms out on the muted text token.
export function scoreRampColor(score: number): string {
  if (score >= 9) return "text-amber-400";
  if (score >= 7) return "text-sky-400";
  if (score >= 5) return "text-emerald-400";
  return "text-lol-text";
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

// Riot switched displayed patch numbers to year-based in 2025 (internal 15.x
// shown as "25.x"), but match data and CDN branches still use the internal
// season number. Shift the major version for display only.
export function formatPatch(patch: string): string {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 ? `${major + 10}.${m[2]}` : patch;
}

export function winRatePercent(wins: number, total: number): string {
  if (total === 0) return "0%";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

// Win rate is outcome-only (design rule 2): green ≥50%, red below, muted for
// small samples (<20 games).
export function winRateColor(wins: number, total: number): string {
  if (total < 20) return "text-lol-text";
  return wins / total >= 0.5 ? "text-lol-win" : "text-lol-loss";
}
