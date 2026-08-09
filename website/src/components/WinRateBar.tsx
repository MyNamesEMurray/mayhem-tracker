import { MIN_SAMPLE } from "../lib/stats";

// The unified "rate meter": 6px bar on a translucent loss track. Fill and
// label carry outcome colors only — green at 50%+, red below. Small samples
// mute the label (with *) and halve the fill's opacity so a lucky 3-0 never
// wears a confident green.
export default function WinRateBar({ wins, total }: { wins: number; total: number }) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  const lowSample = total < MIN_SAMPLE;
  const winning = rate >= 50;

  return (
    <div
      className="flex items-center gap-2"
      title={lowSample ? `Only ${total} game(s) — small sample` : undefined}
    >
      <div className="flex-1 h-1.5 rounded bg-lol-loss/25 overflow-hidden min-w-8">
        <div
          className={`h-full rounded ${winning ? "bg-lol-win" : "bg-lol-loss"} ${
            lowSample ? "opacity-50" : ""
          }`}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span
        className={`text-xs font-medium w-11 shrink-0 text-right whitespace-nowrap ${
          lowSample ? "text-lol-text" : winning ? "text-lol-win" : "text-lol-loss"
        }`}
      >
        {rate.toFixed(1)}%{lowSample ? "*" : ""}
      </span>
    </div>
  );
}
