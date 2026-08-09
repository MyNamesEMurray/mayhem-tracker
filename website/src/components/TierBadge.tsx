import { TIER_MIN_SAMPLE, type Tier } from "../lib/stats";

// The letter always carries the tier — color reinforces, never replaces it
const tierStyle: Record<Tier, string> = {
  "S+": "bg-amber-400/20 text-amber-300 border-amber-400/60",
  S: "bg-orange-500/20 text-orange-300 border-orange-500/60",
  A: "bg-emerald-500/20 text-emerald-300 border-emerald-500/60",
  B: "bg-sky-500/20 text-sky-300 border-sky-500/60",
  C: "bg-violet-500/20 text-violet-300 border-violet-500/60",
  D: "bg-slate-500/20 text-slate-300 border-slate-500/60",
};

export default function TierBadge({ tier, games }: { tier: Tier; games: number }) {
  const lowSample = games < TIER_MIN_SAMPLE;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-8 px-1.5 py-0.5 rounded-md border text-xs font-bold ${tierStyle[tier]} ${
        lowSample ? "opacity-40" : ""
      }`}
      title={lowSample ? `Only ${games} game(s) — tier is provisional` : undefined}
    >
      {tier}
    </span>
  );
}
