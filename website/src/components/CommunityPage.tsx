import { useEffect, useMemo, useState } from "react";
import {
  fetchCommunityTotals,
  fetchGamesPerDay,
  fetchMatchupCoverage,
  fetchPatchSpans,
  type CommunityTotals,
  type GamesPerDayRow,
  type MatchupCoverage,
  type PatchSpanRow,
} from "../lib/api";
import { formatPatch } from "../lib/stats";

const PANEL = "bg-lol-card rounded-xl border border-lol-border/60";
const CHART_DAYS = 45;
// A patch label needs this many columns of clear run before the next boundary,
// or it collides with its neighbour and both become unreadable
const LABEL_MIN_SPAN = 4;
const LABEL = "text-[11px] font-medium uppercase tracking-[.08em] text-lol-text";

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={`${PANEL} p-[18px]`}>
      <p className={LABEL}>{label}</p>
      <p className="text-2xl font-bold text-lol-text-bright mt-1">{value}</p>
      <p className="text-xs text-lol-text mt-0.5">{sub}</p>
    </div>
  );
}

// The impact of the crowdsourced database: every number here exists because
// players opted in — there is no other source of ARAM Mayhem data.
export default function CommunityPage() {
  const [totals, setTotals] = useState<CommunityTotals | null>(null);
  const [perDay, setPerDay] = useState<GamesPerDayRow[]>([]);
  const [spans, setSpans] = useState<PatchSpanRow[]>([]);
  const [coverage, setCoverage] = useState<MatchupCoverage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchCommunityTotals(),
      fetchGamesPerDay(),
      fetchPatchSpans(),
      fetchMatchupCoverage(),
    ])
      .then(([t, d, p, c]) => {
        setTotals(t);
        setPerDay(d);
        setSpans(p);
        setCoverage(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Bar chart over the last 45 days (gaps filled with zero-game days).
  // community_games_per_day buckets by game_creation, so a game shows on the
  // day it was played — a backlog uploaded today lands on its own dates.
  const chart = useMemo(() => {
    if (!perDay.length) return [];
    const byDay = new Map(perDay.map((r) => [r.day, r.games]));
    const days: { day: string; games: number }[] = [];
    const end = new Date(perDay[perDay.length - 1].day + "T00:00:00Z");
    for (let i = 44; i >= 0; i--) {
      const d = new Date(end);
      d.setUTCDate(end.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ day: key, games: byDay.get(key) ?? 0 });
    }
    return days;
  }, [perDay]);
  const maxGames = Math.max(1, ...chart.map((d) => d.games));

  // Which patch each day belongs to, for the bar tooltips
  const patchForDay = useMemo(() => {
    const ordered = [...spans].sort((a, b) => a.first_seen.localeCompare(b.first_seen));
    return (day: string) => {
      let current: string | null = null;
      for (const s of ordered) {
        if (s.first_seen <= day) current = s.patch;
        else break;
      }
      return current ? formatPatch(current) : null;
    };
  }, [spans]);

  // A dashed rule at every patch boundary inside the window. The label is
  // dropped when the next boundary lands too close to fit it.
  const markers = useMemo(() => {
    if (chart.length === 0 || spans.length === 0) return [];
    const columnOf = new Map(chart.map((d, i) => [d.day, i + 1]));
    const found = spans
      .map((s) => ({ patch: formatPatch(s.patch), column: columnOf.get(s.first_seen) }))
      // Column 1 is the window opening mid-patch, not a boundary to draw
      .filter((m): m is { patch: string; column: number } => m.column != null && m.column > 1)
      .sort((a, b) => a.column - b.column);
    return found.map((m, i) => ({
      ...m,
      showLabel: ((found[i + 1]?.column ?? CHART_DAYS + 1) - m.column) >= LABEL_MIN_SPAN,
    }));
  }, [chart, spans]);

  if (error) {
    return (
      <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
        Couldn't load community stats: {error}
      </div>
    );
  }

  // Every unordered pair of the champions that have appeared, mirror matchups
  // (Lux vs Lux) included — that is what the observed count counts too
  const possibleMatchups = coverage ? (coverage.champions * (coverage.champions + 1)) / 2 : 0;
  const matchupPct =
    coverage && possibleMatchups > 0
      ? ((coverage.matchups / possibleMatchups) * 100).toFixed(1)
      : "0.0";

  const hours = totals ? totals.total_seconds / 3600 : 0;
  const performances = totals ? totals.games * 10 : 0;
  const since = totals?.first_game_ms
    ? new Date(totals.first_game_ms).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
        <h1 className="text-[22px] font-extrabold text-lol-gold-light m-0">Community impact</h1>
        {since && <span className="text-xs">counting since {since}</span>}
      </div>
      <p className="text-[13px] mb-4 max-w-[64ch]">
        Riot's API doesn't expose ARAM Mayhem match data, so every number on this site is
        crowdsourced: players run the tracker, opt in, and pool their games anonymously. This
        page is the running total of what that adds up to.
      </p>

      <div className="grid grid-cols-2 min-[881px]:grid-cols-4 gap-4">
        <Tile
          label="Contributors"
          value={totals ? totals.contributors.toLocaleString() : "—"}
          sub="players sharing their games"
        />
        <Tile
          label="Games analyzed"
          value={totals ? totals.games.toLocaleString() : "—"}
          sub={`${performances.toLocaleString()} player performances`}
        />
        <Tile
          label="Gameplay analyzed"
          value={totals ? `${hours >= 100 ? Math.round(hours).toLocaleString() : hours.toFixed(1)} h` : "—"}
          sub="of ARAM Mayhem, end to end"
        />
        <Tile
          label="Champion matchups"
          value={coverage ? coverage.matchups.toLocaleString() : "—"}
          sub={
            coverage
              ? `${matchupPct}% of the ${possibleMatchups.toLocaleString()} possible`
              : "unique pairings seen"
          }
        />
      </div>

      <div className={`${PANEL} p-[18px]`}>
        <p className={`${LABEL} mb-3`}>Games played — last 45 days</p>
        {chart.length === 0 ? (
          <p className="text-sm text-lol-text">No data yet.</p>
        ) : (
          <div>
            {/* One grid column per day, so the marker overlay can sit on the
                same track sizing and land exactly on its boundary day */}
            <div className="relative">
              <div
                className="grid items-end gap-[3px] h-28"
                style={{ gridTemplateColumns: `repeat(${CHART_DAYS}, minmax(0, 1fr))` }}
              >
                {chart.map((d) => {
                  const patch = patchForDay(d.day);
                  return (
                    <div
                      key={d.day}
                      className="rounded-t-[3px] bg-lol-gold/70 hover:bg-lol-gold transition-colors min-w-0"
                      style={{ height: `${Math.max(d.games > 0 ? 6 : 1.5, (d.games / maxGames) * 100)}%` }}
                      title={`${d.day}: ${d.games} game${d.games === 1 ? "" : "s"}${patch ? ` · patch ${patch}` : ""}`}
                    />
                  );
                })}
              </div>
              <div
                className="absolute inset-0 grid gap-[3px] pointer-events-none"
                style={{ gridTemplateColumns: `repeat(${CHART_DAYS}, minmax(0, 1fr))` }}
              >
                {markers.map((m) => (
                  <div
                    key={m.patch}
                    className="relative border-l border-dashed border-lol-gold/45"
                    style={{ gridColumn: `${m.column} / span 1` }}
                  >
                    {m.showLabel && (
                      <span className="absolute -top-0.5 left-[3px] whitespace-nowrap bg-lol-card px-1 text-[9px] tracking-[.04em] text-lol-gold">
                        {m.patch}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-lol-text/70">
              <span>{chart[0].day}</span>
              <span>{chart[chart.length - 1].day}</span>
            </div>
          </div>
        )}
      </div>

      {/* Copy plus the action it asks for — the panel is full width, so the
          button anchors the empty half instead of leaving dead space */}
      <div
        className={`${PANEL} p-[18px] flex flex-col gap-4 min-[861px]:flex-row min-[861px]:items-center min-[861px]:gap-6`}
      >
        <div className="min-w-0">
          <p className={`${LABEL} mb-2`}>Every game counts</p>
          <p className="text-[13px] text-lol-text leading-relaxed max-w-[80ch]">
            Each contributed game adds all ten players' champions, augments, items, and combat
            lines to the pool — anonymously, with duplicates counted once. The more players opt
            in, the sharper the tier lists get, especially early in a patch. Install the tracker
            and flip on Community Stats in Settings to be part of it, or read{" "}
            <a href="/about/" className="text-lol-gold hover:text-lol-gold-light">
              how the stats work
            </a>
            .
          </p>
        </div>
        <a
          href="/download/"
          className="shrink-0 min-[861px]:ml-auto inline-flex items-center justify-center gap-2 rounded-lg border border-lol-gold/30 bg-lol-gold/10 px-4 py-2.5 text-[13px] font-semibold text-lol-gold hover:bg-lol-gold/20 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m7 12 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Download MayhemStats Tracker
        </a>
      </div>
    </div>
  );
}
