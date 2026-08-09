interface WinRateBarProps {
  wins: number;
  total: number;
  showPercent?: boolean;
}

// Unified 6px rate meter: green fill on a faint loss track, outcome-colored
// percent (green ≥50, red below). Small samples (<20 games) render muted with
// a "*" and half-opacity fill.
export default function WinRateBar({ wins, total, showPercent = true }: WinRateBarProps) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  const lowSample = total < 20;

  return (
    <div
      className="flex items-center gap-2"
      title={lowSample ? `Only ${total} game${total === 1 ? "" : "s"} — small sample` : undefined}
    >
      <div className="flex-1 h-1.5 bg-lol-loss/25 rounded overflow-hidden min-w-16">
        <div
          className={`h-full bg-lol-win rounded transition-all ${lowSample ? "opacity-50" : ""}`}
          style={{ width: `${rate}%` }}
        />
      </div>
      {showPercent && (
        <span
          className={`text-xs font-medium min-w-10 text-right ${
            lowSample ? "text-lol-text" : rate >= 50 ? "text-lol-win" : "text-lol-loss"
          }`}
        >
          {rate.toFixed(1)}%{lowSample ? "*" : ""}
        </span>
      )}
    </div>
  );
}
