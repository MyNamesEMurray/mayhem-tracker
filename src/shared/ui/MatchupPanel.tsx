import { useMemo, useState } from "react";
import { LABEL, PANEL } from "./primitives";
import ChampionIcon from "./ChampionIcon";
import WinRateBar from "./WinRateBar";
import { MIN_SAMPLE, score, scoreCeiling } from "../score";
import { formatWhole } from "../format";

// Who this champion beats, and who beats it.
//
// Every cross-team pairing in every game has been in the database since the
// first upload, and the only thing that ever read it was a tile counting how
// many distinct pairs existed. The question it can actually answer is the one
// players ask before they lock in.
//
// Ranked from both ends of the same confidence interval, which is the part
// worth getting right. The good side is Score, the win rate the record
// supports at least. The bad side is the ceiling, the win rate it cannot rule
// out - because sorting by Score ascending would fill "struggles against"
// with whichever opponents have been met three times and lost to, every time,
// which is noise wearing the shape of a finding.

export interface MatchupRow {
  opponent_id: number;
  games: number;
  wins: number;
}

// A pairing under this many games is not a matchup, it is an anecdote. Higher
// than the tier list's floor because a matchup row is read as advice about
// one opponent rather than as one entry in a ranked hundred.
const MIN_MATCHUP_GAMES = MIN_SAMPLE * 2;
const SHOWN = 6;

export default function MatchupPanel({
  championId,
  rows,
  championName,
  href,
  onSelect,
}: {
  championId: number;
  rows: MatchupRow[];
  championName: (championId: number) => string;
  // The site links each opponent so the row is shareable; the app navigates
  href?: (championId: number) => string;
  onSelect?: (championId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { ranked, byCeiling, thin } = useMemo(() => {
    const byOpponent = new Map<number, MatchupRow>();
    for (const r of rows) {
      const seen = byOpponent.get(r.opponent_id);
      if (seen) {
        seen.games += r.games;
        seen.wins += r.wins;
      } else {
        byOpponent.set(r.opponent_id, { ...r });
      }
    }
    // A mirror is 50% by construction - the same champion is on both sides of
    // every one of those games - so it is not a matchup, it is arithmetic
    const all = [...byOpponent.values()].filter((r) => r.opponent_id !== championId);
    const eligible = all.filter((r) => r.games >= MIN_MATCHUP_GAMES);
    const ranked = [...eligible].sort((a, b) => score(b.wins, b.games) - score(a.wins, a.games));
    const byCeiling = [...eligible].sort(
      (a, b) => scoreCeiling(a.wins, a.games) - scoreCeiling(b.wins, b.games),
    );
    return { ranked, byCeiling, thin: all.length - eligible.length };
  }, [rows, championId]);

  // The two columns partition the list; they never share an opponent. The two
  // orderings are not exact inverses - one reads the floor of the interval and
  // the other the ceiling - so without this an opponent in the middle could
  // appear under both headings at once, which reads as the panel contradicting
  // itself. Half the list each way when everything is shown, six otherwise.
  const { best, worst } = useMemo(() => {
    const half = Math.floor(ranked.length / 2);
    const shown = expanded ? half : Math.min(SHOWN, half);
    const best = ranked.slice(0, shown);
    const taken = new Set(best.map((r) => r.opponent_id));
    return { best, worst: byCeiling.filter((r) => !taken.has(r.opponent_id)).slice(0, shown) };
  }, [ranked, byCeiling, expanded]);

  if (ranked.length === 0) {
    return (
      <div className={`${PANEL} p-4`}>
        <h2 className={`${LABEL} mb-2`}>Matchups</h2>
        <p className="text-xs text-lol-text">
          {rows.length === 0
            ? "No games recorded against this champion yet."
            : `No opponent has been faced ${MIN_MATCHUP_GAMES} times yet under these filters. Widen the patch range to see matchups.`}
        </p>
      </div>
    );
  }

  return (
    <div className={`${PANEL} p-4 space-y-3`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className={LABEL}>Matchups</h2>
        <span className="text-[11px] text-lol-text">
          {ranked.length} opponents with {MIN_MATCHUP_GAMES}+ games
          {thin > 0 && ` · ${thin} too thin to rank`}
        </span>
      </div>

      <div className="grid gap-3 grid-cols-1 min-[700px]:grid-cols-2">
        <Column
          title="Strong into"
          rows={best}
          championName={championName}
          href={href}
          onSelect={onSelect}
        />
        <Column
          title="Struggles against"
          rows={worst}
          championName={championName}
          href={href}
          onSelect={onSelect}
        />
      </div>

      {ranked.length > SHOWN * 2 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-lol-text hover:text-lol-gold transition-colors cursor-pointer"
        >
          {expanded ? `Show the top ${SHOWN} each way` : `Show all ${ranked.length}`}
        </button>
      )}

      <p className="text-[11px] text-lol-text/70">
        Strong into ranks by Score, the win rate the record supports at least. Struggles against
        ranks by the other end of the same interval, the win rate it cannot rule out, so a matchup
        has to be losing on its best reading to appear there.
      </p>
    </div>
  );
}

function Column({
  title,
  rows,
  championName,
  href,
  onSelect,
}: {
  title: string;
  rows: MatchupRow[];
  championName: (championId: number) => string;
  href?: (championId: number) => string;
  onSelect?: (championId: number) => void;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[.08em] text-lol-text mb-1.5">{title}</p>
      <ul className="space-y-1 max-h-[420px] overflow-y-auto scroll-stable">
        {rows.map((r) => {
          const name = championName(r.opponent_id);
          const inner = (
            <>
              <ChampionIcon championId={r.opponent_id} size={22} />
              <span className="text-xs text-lol-text-bright truncate flex-1 min-w-0">{name}</span>
            </>
          );
          return (
            <li
              key={r.opponent_id}
              className="flex items-center gap-2 bg-lol-dark/50 border border-lol-border/50 rounded-lg px-2 py-1.5"
            >
              {href ? (
                <a
                  href={href(r.opponent_id)}
                  onClick={(e) => {
                    if (!onSelect) return;
                    e.preventDefault();
                    onSelect(r.opponent_id);
                  }}
                  className="flex items-center gap-2 min-w-0 w-[124px] hover:text-lol-gold"
                >
                  {inner}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onSelect ? () => onSelect(r.opponent_id) : undefined}
                  className={`flex items-center gap-2 min-w-0 w-[124px] text-left ${
                    onSelect ? "hover:text-lol-gold cursor-pointer" : ""
                  }`}
                >
                  {inner}
                </button>
              )}
              <span className="text-[11px] text-lol-text w-14 shrink-0 text-right">
                {formatWhole(r.games)}
              </span>
              <div className="flex-1 min-w-16">
                <WinRateBar wins={r.wins} total={r.games} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
