import { MIN_SAMPLE } from "../lib/champStats";

interface WinRateBarProps {
  wins: number;
  total: number;
  showPercent?: boolean;
}

// The unified rate meter: a 6px bar on a translucent loss track. Fill and
// label both carry outcome colors — green at 50%+, red below — so a losing
// record reads as one at a glance rather than as a shorter green bar. Small
// samples mute the label (with a "*") and halve the fill's opacity, so a lucky
// 3-0 never wears a confident green. Matches website/src/components/WinRateBar.
export default function WinRateBar({ wins, total, showPercent = true }: WinRateBarProps) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  const lowSample = total < MIN_SAMPLE;
  const winning = rate >= 50;

  return (
    <div
      className="flex items-center gap-2"
      title={lowSample ? `Only ${total} game${total === 1 ? "" : "s"} — small sample` : undefined}
    >
      <div className="flex-1 h-1.5 bg-lol-loss/25 rounded overflow-hidden min-w-16">
        <div
          className={`h-full rounded transition-all ${winning ? "bg-lol-win" : "bg-lol-loss"} ${
            lowSample ? "opacity-50" : ""
          }`}
          style={{ width: `${rate}%` }}
        />
      </div>
      {showPercent && (
        <span
          className={`text-xs font-medium min-w-[3.25rem] inline-flex justify-end ${
            lowSample ? "text-lol-text" : winning ? "text-lol-win" : "text-lol-loss"
          }`}
        >
          {/* The asterisk gets a slot of its own, occupied or not, so the %
              signs line up down the column rather than every starred row
              shunting its number a character left. Same as the website. */}
          <span className="tabular-nums">{rate.toFixed(1)}%</span>
          <span className="w-2 text-left" aria-hidden={!lowSample}>
            {lowSample ? "*" : ""}
          </span>
        </span>
      )}
    </div>
  );
}
