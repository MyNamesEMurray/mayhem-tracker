import { useEffect, useMemo, useState } from "react";
import {
  fetchCommunityTotals,
  fetchGamesPerDay,
  type CommunityTotals,
  type GamesPerDayRow,
} from "../lib/api";

const PANEL = "bg-lol-card rounded-xl border border-lol-border/60";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchCommunityTotals(), fetchGamesPerDay()])
      .then(([t, d]) => {
        setTotals(t);
        setPerDay(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Bar chart over the last 45 days (gaps filled with zero-game days)
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

  if (error) {
    return (
      <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
        Couldn't load community stats: {error}
      </div>
    );
  }

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
          label="Patches covered"
          value={totals ? String(totals.patches) : "—"}
          sub="tracked across the mode's runs"
        />
      </div>

      <div className={`${PANEL} p-[18px]`}>
        <p className={`${LABEL} mb-3`}>Games contributed — last 45 days</p>
        {chart.length === 0 ? (
          <p className="text-sm text-lol-text">No data yet.</p>
        ) : (
          <div>
            <div className="flex items-end gap-[3px] h-28">
              {chart.map((d) => (
                <div
                  key={d.day}
                  className="flex-1 rounded-t-[3px] bg-lol-gold/70 hover:bg-lol-gold transition-colors min-w-0"
                  style={{ height: `${Math.max(d.games > 0 ? 6 : 1.5, (d.games / maxGames) * 100)}%` }}
                  title={`${d.day}: ${d.games} game${d.games === 1 ? "" : "s"}`}
                />
              ))}
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
          href="https://github.com/MyNamesEMurray/mayhem-tracker/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 min-[861px]:ml-auto inline-flex items-center justify-center gap-2 rounded-lg border border-lol-gold/30 bg-lol-gold/10 px-4 py-2.5 text-[13px] font-semibold text-lol-gold hover:bg-lol-gold/20 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m7 12 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Download Mayhem Tracker
        </a>
      </div>
    </div>
  );
}
