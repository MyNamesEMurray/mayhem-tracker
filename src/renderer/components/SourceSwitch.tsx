import { useCallback, useEffect, useState } from "react";
import type { CommunityMeta } from "../lib/types";

// Which pool of games a stats page is reading.
//
// This exists because the two were previously told apart only by which tab
// you were on, and people read "no Braum games yet" — true of their own
// twenty matches — as a statement about the mode. Naming the source in the
// page, and letting it be switched in place, is the fix.
export type StatsSource = "mine" | "community";

const KEY = "stats-source";

// One source for the whole app, not one per page. Reading localStorage on
// mount already carried the choice from tab to tab, but only because tabs are
// routes that remount; anything mounted at the same time would have drifted.
// This keeps every subscriber on the same value the moment it changes.
let current: StatsSource = (() => {
  try {
    return localStorage.getItem(KEY) === "community" ? "community" : "mine";
  } catch {
    return "mine";
  }
})();

const listeners = new Set<(s: StatsSource) => void>();

export function useStatsSource(): [StatsSource, (s: StatsSource) => void] {
  const [source, setSourceState] = useState<StatsSource>(current);

  useEffect(() => {
    listeners.add(setSourceState);
    // A subscriber that mounted after a change catches up here
    setSourceState(current);
    return () => {
      listeners.delete(setSourceState);
    };
  }, []);

  const setSource = useCallback((next: StatsSource) => {
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // A preference that can't be stored just doesn't persist
    }
    for (const listener of listeners) listener(next);
  }, []);

  return [source, setSource];
}

function freshness(fetchedAt: number): string {
  const mins = Math.round((Date.now() - fetchedAt) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SourceSwitch({
  source,
  onChange,
}: {
  source: StatsSource;
  onChange: (s: StatsSource) => void;
}) {
  const [meta, setMeta] = useState<CommunityMeta | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (source !== "community") return;
    let alive = true;
    window.api
      .getCommunityMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [source]);

  const refresh = () => {
    setBusy(true);
    window.api
      .refreshCommunity()
      .then(setMeta)
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const option = (value: StatsSource, label: string, title: string) => (
    <button
      key={value}
      onClick={() => onChange(value)}
      title={title}
      className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors cursor-pointer ${
        source === value
          ? "bg-lol-gold/20 text-lol-gold-light"
          : "text-lol-text hover:text-lol-gold-light"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 rounded-lg border border-lol-border/60 bg-lol-card p-0.5">
        {option("mine", "My performance", "Your own match history — how these have gone for you")}
        {option(
          "community",
          "Community",
          "Every contributed game in the shared database — the same numbers as mayhemstats.com",
        )}
      </div>
      {source === "community" && (
        <span className="text-[11px] text-lol-text">
          {meta
            ? `${meta.games.toLocaleString()} games · updated ${freshness(meta.fetchedAt)}`
            : "loading…"}
          <button
            onClick={refresh}
            disabled={busy}
            className="ml-2 text-lol-gold hover:text-lol-gold-light disabled:opacity-50 cursor-pointer"
          >
            {busy ? "refreshing…" : "refresh"}
          </button>
        </span>
      )}
    </div>
  );
}
