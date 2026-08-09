import { MIN_SAMPLE } from "../lib/stats";

// The percentage is always shown as text beside the bar, so color never
// carries the value alone. Below MIN_SAMPLE the number renders muted: a tiny
// sample shouldn't wear the same confident color as a proven one.
export default function WinRateBar({ wins, total }: { wins: number; total: number }) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  const lowSample = total < MIN_SAMPLE;

  return (
    <div
      className="flex items-center gap-2"
      title={lowSample ? `Only ${total} game(s) — small sample` : undefined}
    >
      <div className="flex-1 h-2 bg-lol-loss/30 rounded-full overflow-hidden min-w-16">
        <div className="h-full bg-lol-win rounded-full" style={{ width: `${rate}%` }} />
      </div>
      <span
        className={`text-xs font-medium min-w-10 text-right ${
          lowSample
            ? "text-lol-text"
            : rate >= 60
              ? "text-lol-win"
              : rate >= 50
                ? "text-sky-400"
                : "text-lol-loss"
        }`}
      >
        {rate.toFixed(1)}%{lowSample ? "*" : ""}
      </span>
    </div>
  );
}
