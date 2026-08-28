import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PANEL } from "../../shared/ui/primitives";
import { useIpc } from "../hooks/useIpc";
import { useLiveGame } from "../hooks/useLiveGame";
import { useChampionData, useAugmentData, getChampionName } from "../hooks/useChampions";
import { usePatchOptions } from "../hooks/usePatchOptions";
import { useStatsFilters } from "../hooks/useStatsFilters";
import type { AugmentStats } from "../lib/types";
import AugmentIcon from "../../shared/ui/AugmentIcon";
import ChampionIcon from "../../shared/ui/ChampionIcon";
import PatchRangeSelect from "../../shared/ui/PatchRangeSelect";
import WinRateBar from "../../shared/ui/WinRateBar";
import { RARITY_LABEL, RARITY_TEXT } from "../../shared/ui/rarity";
import { assignTiers, MIN_SAMPLE, score } from "../../shared/score";
import TierBadge from "../../shared/ui/TierBadge";
import { formatPatch, patchesIn, patchLabel } from "../../shared/patch";
import { formatWhole } from "../lib/format";
import { championIdFromLiveName, augmentIdsFromNames } from "../../shared/live-lookup";

// What to take, while there is still time to take it.
//
// Augments are the highest-leverage decision in Mayhem, they are offered
// under time pressure three times a game, and this app is already open on the
// second monitor with both halves of the answer in it: it polls the Live
// Client Data API every five seconds, so it knows the champion being played,
// and it holds community augment win rates broken down per champion. Nothing
// connected the two.
//
// What this is not: the Live Client Data API does not expose which three
// augments you are being offered. I checked. So this cannot say "take the
// middle one" - it is the ranked board for your champion, which you glance at
// and match against the offer on screen yourself. Reading the offer would
// mean image recognition or memory reading, which is a different product with
// a different risk profile, and this one stays inside published APIs.
//
// What it does know is which augments you have already taken, because one
// reveals itself by replacing a summoner spell's name. Those are struck off.

// The patches the widened board is actually reading, named the way
// patchLabel names a range. Not patchLabel itself, because that takes a
// selection against the full option list and this is already a list.
function widenedLabel(patches: string[]): string {
  if (patches.length === 0) return "";
  if (patches.length === 1) return `Patch ${formatPatch(patches[0])}`;
  return `Patches ${formatPatch(patches[patches.length - 1])}\u2013${formatPatch(patches[0])}`;
}

// Strongest last, which is the order the rounds come in
const RARITIES = ["kSilver", "kGold", "kPrismatic"] as const;
// How many to list per rarity. Enough that one of your three offers is very
// likely on it, short enough to read in the time the game gives you.
const PER_RARITY = 8;
// Below this many picks on the newest patch, the board reaches back a couple
// of patches rather than ranking noise. Same rule and the same number the
// website's tier list widens on.
const AUTO_WIDEN_PATCHES = 3;

export default function Live() {
  const live = useLiveGame();
  const navigate = useNavigate();
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const patchOptions = usePatchOptions("community");
  const { patchSelection, setPatchSelection, queue } = useStatsFilters();

  const championId = useMemo(
    () => championIdFromLiveName(champData, live?.championName),
    [champData, live?.championName],
  );

  const selected = useMemo(
    () => patchesIn(patchSelection, patchOptions),
    [patchSelection, patchOptions],
  );

  const { data, error } = useIpc<{ augments: AugmentStats[] }>(
    () =>
      championId == null
        ? Promise.resolve({ augments: [] })
        : window.api.getCommunityChampionDetail(championId, selected, queue),
    [championId, selected, queue],
  );

  // A thin patch is worse than an old one. If the newest patch has not seen
  // this champion enough to rank anything, reach back and say so.
  const thin = (data?.augments ?? []).reduce((n, a) => n + a.picks, 0) < MIN_SAMPLE * 4;
  const widened = useMemo(
    () => (thin ? patchOptions.slice(0, AUTO_WIDEN_PATCHES) : undefined),
    [thin, patchOptions],
  );
  const { data: wide } = useIpc<{ augments: AugmentStats[] }>(
    () =>
      championId == null || !widened?.length
        ? Promise.resolve({ augments: [] })
        : window.api.getCommunityChampionDetail(championId, widened, queue),
    [championId, widened, queue],
  );

  const augments = thin && wide?.augments.length ? wide.augments : (data?.augments ?? []);
  const showingWider = thin && (wide?.augments.length ?? 0) > 0;

  const taken = useMemo(
    () => augmentIdsFromNames(augmentData, live?.takenAugments),
    [augmentData, live?.takenAugments],
  );

  // Tiers rank an augment against others of its own rarity, exactly as the
  // Augments tab does - a Prismatic is strictly stronger than a Silver, so one
  // ranking across all of them would just sort by rarity.
  const byRarity = useMemo(() => {
    const groups = new Map<string, AugmentStats[]>();
    for (const a of augments) {
      const rarity = augmentData[a.augment_id]?.rarity;
      if (!rarity) continue;
      const group = groups.get(rarity) ?? [];
      group.push(a);
      groups.set(rarity, group);
    }
    return groups;
  }, [augments, augmentData]);

  // Leaving a game should not leave a dead page on screen. Null is "not asked
  // yet" rather than "no game", so this waits for an answer instead of
  // bouncing off the tab the moment it is opened.
  useEffect(() => {
    if (live && !live.inGame) navigate("/", { replace: true });
  }, [live, navigate]);

  if (live == null) return <div className="text-lol-text text-center mt-20">Loading...</div>;
  if (!live.inGame) return null;

  const totalPicks = augments.reduce((n, a) => n + a.picks, 0);

  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {championId != null && <ChampionIcon championId={championId} size={44} />}
          <div>
            <h1 className="text-xl font-bold text-lol-text-bright">
              {championId != null
                ? `Best augments for ${getChampionName(champData, championId)}`
                : "Best augments"}
            </h1>
            <p className="text-xs text-lol-text mt-0.5">
              {showingWider
                ? `${widenedLabel(widened ?? [])} · widened, this patch is thin`
                : patchLabel(patchSelection, patchOptions)}
              {" · "}
              {formatWhole(totalPicks)} picks · community
            </p>
          </div>
        </div>
        <PatchRangeSelect
          patches={patchOptions}
          selection={patchSelection}
          onChange={setPatchSelection}
        />
      </div>

      {championId == null && (
        <div className={`${PANEL} p-4 text-sm text-lol-text`}>
          A game is running, but the champion has not come through yet. This fills in within a few
          seconds of the game starting.
        </div>
      )}

      {error && (
        <div className={`${PANEL} p-4 text-sm text-lol-loss`}>
          Couldn't load community augments: {error}
        </div>
      )}

      {championId != null && !error && (
        <div className="grid gap-3 grid-cols-1 min-[900px]:grid-cols-3">
          {RARITIES.map((rarity) => (
            <RarityColumn
              key={rarity}
              rarity={rarity}
              rows={byRarity.get(rarity) ?? []}
              taken={taken}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-lol-text/70">
        Ranked by Score, which is the win rate the record supports out of 100, so a thin sample sits
        below the rate it happened to produce. Tiers rank each augment against others of its rarity.
        * fewer than {MIN_SAMPLE} games - treat with caution. The game does not tell this app which
        three augments it is offering you, so match your offer against the list rather than
        expecting it to pick.
      </p>
    </div>
  );
}

function RarityColumn({
  rarity,
  rows,
  taken,
}: {
  rarity: string;
  rows: AugmentStats[];
  taken: Set<number>;
}) {
  const tiers = useMemo(
    () =>
      assignTiers(
        rows,
        (a) => score(a.wins, a.picks),
        (a) => a.augment_id,
      ),
    [rows],
  );

  const ranked = useMemo(() => {
    const sorted = [...rows].sort((a, b) => score(b.wins, b.picks) - score(a.wins, a.picks));
    // An augment already taken cannot be offered again, so it leaves the
    // ranking rather than sitting in it greyed out and using up a line
    return sorted.filter((a) => !taken.has(a.augment_id)).slice(0, PER_RARITY);
  }, [rows, taken]);

  const struck = rows.filter((a) => taken.has(a.augment_id));

  return (
    <div className={`${PANEL} overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2 bg-lol-dark/50 border-b border-lol-border/50">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[.08em] ${RARITY_TEXT[rarity]}`}
        >
          {RARITY_LABEL[rarity] ?? rarity}
        </span>
        <span className="text-[11px] text-lol-text">{rows.length} seen</span>
      </div>
      {ranked.length === 0 ? (
        <p className="px-3 py-4 text-xs text-lol-text">
          No community games with this champion and rarity yet.
        </p>
      ) : (
        <ul>
          {ranked.map((a) => (
            <li
              key={a.augment_id}
              className="flex items-center gap-2 px-3 py-2 border-t border-lol-border/40 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <AugmentIcon augmentId={a.augment_id} size={26} showName />
              </div>
              <TierBadge tier={tiers.get(a.augment_id)!} games={a.picks} />
              <span className="w-9 text-right text-[13px] font-semibold text-lol-text-bright">
                {score(a.wins, a.picks).toFixed(1)}
              </span>
              <div className="w-[104px] shrink-0">
                <WinRateBar wins={a.wins} total={a.picks} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {struck.length > 0 && (
        <p className="px-3 py-2 border-t border-lol-border/40 text-[11px] text-lol-text">
          Taken this game: {struck.length}
        </p>
      )}
    </div>
  );
}
