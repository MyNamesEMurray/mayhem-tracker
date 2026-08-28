import { useMemo } from "react";
import AugmentIcon from "./AugmentIcon";
import WinRateBar from "./WinRateBar";
import { score, winRate } from "../score";
import { formatWhole } from "../format";

// Which augments work together.
//
// Every combination a player actually ran has been recorded with the win
// attached since build-order tracking started, because augments are stored
// per participant with their slot. Nothing computed it. Nobody else collects
// Mayhem augments at this grain, which makes this the one thing on either
// surface that cannot be got anywhere else.
//
// The number that matters is not the pair's win rate, which is mostly just
// the win rate of whichever half is stronger. It is the lift: how far the
// pair beats its own best half. And it is measured conservatively, from the
// floor of the pair's confidence interval rather than its observed rate, so a
// pairing has to be proven better rather than merely luckier.

export interface AugmentPairRow {
  augment_a: number;
  augment_b: number;
  picks: number;
  wins: number;
}

// Pairs are two augments deep, so they are sampled far thinner than either
// half. Well above the tier list's floor, on purpose: this is the finding
// most likely to be noise if it is let through.
const MIN_PAIR_PICKS = 100;
const SHOWN = 8;

export default function AugmentPairs({
  augmentId,
  rows,
  soloRate,
}: {
  augmentId: number;
  rows: AugmentPairRow[];
  // The win rate of one augment on its own, out of 100, or null when it is
  // not known. Without it there is no lift to report and the list falls back
  // to ranking the pairs on their own merits.
  soloRate: (augmentId: number) => number | null;
}) {
  const ranked = useMemo(() => {
    // Rows arrive per patch; the pair is what is being ranked
    const byPartner = new Map<number, { partner: number; picks: number; wins: number }>();
    for (const r of rows) {
      const partner = r.augment_a === augmentId ? r.augment_b : r.augment_a;
      if (partner === augmentId) continue;
      const e = byPartner.get(partner) ?? { partner, picks: 0, wins: 0 };
      e.picks += r.picks;
      e.wins += r.wins;
      byPartner.set(partner, e);
    }
    const mine = soloRate(augmentId);
    return [...byPartner.values()]
      .filter((p) => p.picks >= MIN_PAIR_PICKS)
      .map((p) => {
        const theirs = soloRate(p.partner);
        // The bar to clear is the better half on its own. Beating the weaker
        // one is what any decent augment does to a bad one.
        const alone = Math.max(mine ?? -Infinity, theirs ?? -Infinity);
        const floor = score(p.wins, p.picks);
        return {
          ...p,
          rate: winRate(p.wins, p.picks),
          lift: Number.isFinite(alone) ? floor - alone : null,
          floor,
        };
      })
      .sort((a, b) => (b.lift ?? b.floor) - (a.lift ?? a.floor))
      .slice(0, SHOWN);
  }, [rows, augmentId, soloRate]);

  if (ranked.length === 0) {
    return (
      <p className="text-xs text-lol-text">
        No pairing with this augment has {MIN_PAIR_PICKS} games yet under these filters.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {ranked.map((p) => (
        <div
          key={p.partner}
          className="flex items-center gap-2 bg-lol-dark/50 border border-lol-border/50 rounded-lg px-2.5 py-1.5"
        >
          <div className="min-w-0 w-[168px]">
            <AugmentIcon augmentId={p.partner} size={22} showName />
          </div>
          <span className="text-xs text-lol-text w-14 shrink-0 text-right">
            {formatWhole(p.picks)}
          </span>
          <div className="flex-1 min-w-16">
            <WinRateBar wins={p.wins} total={p.picks} />
          </div>
          {p.lift != null && (
            <span
              className={`text-[11px] w-24 shrink-0 text-right ${
                p.lift >= 0 ? "text-lol-win" : "text-lol-text"
              }`}
              title="How far the pair's Score beats the better of the two augments on its own"
            >
              {p.lift >= 0 ? "+" : ""}
              {p.lift.toFixed(1)} vs alone
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
