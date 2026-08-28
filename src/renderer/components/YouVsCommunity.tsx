import { LABEL, PANEL } from "../../shared/ui/primitives";
import WinRateBar from "../../shared/ui/WinRateBar";
import type { ChampionStats } from "../lib/types";
import { KDA_RAMP, kdaRatio, rampClass } from "../../shared/format";
import { MIN_SAMPLE, winRate } from "../../shared/score";
import { formatWhole } from "../lib/format";

// Your record on this champion, next to everyone's.
//
// The app has held both numbers for as long as it has had a community source,
// and the champion page had a switch between them - which meant you could see
// either one and never both. "You win 44% on Lux, the community wins 53%" is
// a different sentence from either half of it, and it needs no new data: both
// datasets are already on this page.
//
// It also answers the question an opt-in never answered. 2,144 people share
// their games and the app could tell them their contributor id and let them
// withdraw, which is the right baseline and still a one-way donation. Saying
// how many of the games behind this number are yours turns it into joining
// something.

// Below this, a difference is not a finding. The whole point of Score is that
// a small sample cannot support a claim, and a delta between two win rates is
// a claim about both.
const DELTA_MIN_GAMES = MIN_SAMPLE;

export default function YouVsCommunity({
  yours,
  community,
  contributed,
  championName,
}: {
  yours: ChampionStats | null;
  community: ChampionStats | null;
  // How many of your games on this champion the pool actually holds
  contributed: number;
  championName: string;
}) {
  if (!community) return null;

  const yourGames = yours?.games ?? 0;
  const yourRate = yours ? winRate(yours.wins, yours.games) : null;
  const theirRate = winRate(community.wins, community.games);
  const delta = yourRate == null ? null : yourRate - theirRate;
  const enough = yourGames >= DELTA_MIN_GAMES;

  return (
    <div className={`${PANEL} p-4 space-y-3`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className={LABEL}>You vs the community</h2>
        {contributed > 0 && (
          <span className="text-[11px] text-lol-text">
            {formatWhole(contributed)} of your {championName} games{" "}
            {contributed === 1 ? "is" : "are"} in the {formatWhole(community.games)} behind these
            numbers
          </span>
        )}
      </div>

      {yourGames === 0 ? (
        <p className="text-xs text-lol-text">
          You have no recorded games on {championName} under these filters, so there is nothing to
          compare yet.
        </p>
      ) : (
        <>
          <Row label="You" games={yourGames} wins={yours!.wins} stats={yours!} />
          <Row label="Community" games={community.games} wins={community.wins} stats={community} />

          <p className="text-xs">
            {enough && delta != null ? (
              <>
                <span
                  className={
                    delta >= 0 ? "text-lol-win font-semibold" : "text-lol-loss font-semibold"
                  }
                >
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)} points
                </span>{" "}
                <span className="text-lol-text">
                  {delta >= 0 ? "above" : "below"} the community on {championName}, over{" "}
                  {formatWhole(yourGames)} games.
                </span>
              </>
            ) : (
              <span className="text-lol-text">
                {formatWhole(yourGames)} game{yourGames === 1 ? "" : "s"} is not enough to compare
                against {formatWhole(community.games)}. A difference here would be noise; play{" "}
                {DELTA_MIN_GAMES - yourGames} more and this line becomes a number.
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  games,
  wins,
  stats,
}: {
  label: string;
  games: number;
  wins: number;
  stats: ChampionStats;
}) {
  const kda = kdaRatio(stats.kills, stats.deaths, stats.assists);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-[11px] uppercase tracking-[.08em] text-lol-text w-20 shrink-0">
        {label}
      </span>
      <span className="text-[13px] text-lol-text-bright w-16 shrink-0 text-right">
        {formatWhole(games)}
      </span>
      <div className="flex-1 min-w-[140px]">
        <WinRateBar wins={wins} total={games} />
      </div>
      <span className={`text-[13px] font-semibold w-12 text-right ${rampClass(kda, KDA_RAMP)}`}>
        {kda.toFixed(2)}
      </span>
    </div>
  );
}
