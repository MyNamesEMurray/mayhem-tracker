import type { ReactNode } from "react";
import { formatWhole, KDA_RAMP, kdaRatio, rampClass } from "../format";
import { score, TIER_ORDER, type Tier } from "../score";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import TierBadge from "./TierBadge";
import WinRateBar from "./WinRateBar";
import type { BoardColumn } from "./boardSort";

// The columns of the two tier lists, written once.
//
// This is the half of the unification that the surfaces used to disagree
// about. The app drew Kills, Deaths, Assists and Gold; the site folded K/D/A
// into one KDA cell and had no Gold at all. Neither difference was designed.
//
// The union wins, which is the rule that settled SearchField and WinRateBar:
// ship the superset and let the layout decide what fits. Thirteen columns do
// not fit a 1280px window, so Kills, Deaths and Assists are marked `detail`
// and get columns of their own only from 1400px. They are the only three that
// can be held back without losing anything, because the KDA column prints the
// same numbers at every width. Below 700px the board becomes cards.

export type ChampionSortKey =
  | "name"
  | "tier"
  | "score"
  | "winRate"
  | "games"
  | "pickRate"
  | "kills"
  | "deaths"
  | "assists"
  | "kda"
  | "damage"
  | "gold";

// What a board row has to carry. The app's ChampionStats satisfies this as
// it stands; the site adds the two per-game figures to its aggregate.
export interface BoardChampion {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avg_damage: number;
  avg_gold: number;
}

// Tier sorts by rank with score breaking ties inside it, because a tier holds
// a wide slice of the roster - a third of it, some patches - and an unbroken
// tie there would leave the order inside a tier meaning nothing. Negated so
// that descending, the direction a tier list is read in, puts S+ first.
function tierSortValue(tier: Tier | undefined, scoreValue: number): number {
  const rank = tier ? TIER_ORDER.indexOf(tier) : TIER_ORDER.length;
  return -rank * 1000 + scoreValue;
}

const per = (total: number, n: number) => (n > 0 ? total / n : 0);

export function championColumns({
  tiers,
  totalSlots,
  name,
  href,
  iconSize = 28,
}: {
  tiers: Map<number, Tier>;
  // Champion slots under the current filters. A champion's share of them is
  // its pick rate, the same denominator on both surfaces.
  totalSlots: number;
  name: (championId: number) => string;
  // The site links each name so a row is shareable and a crawler has
  // something to follow. The app has no URLs, and passes nothing.
  href?: (championId: number) => string;
  iconSize?: number;
}): BoardColumn<BoardChampion, ChampionSortKey>[] {
  return [
    {
      key: null,
      // The rank is the row's position in whatever order is showing, so there
      // is nothing to sort it by
      label: "#",
      area: "rank",
      width: "w-10",
      cellClass: "text-xs text-lol-text",
      render: (_row, i) => i + 1,
    },
    {
      key: "name",
      label: "Champion",
      naturalDir: "asc",
      area: "name",
      sortValue: (c) => name(c.champion_id),
      render: (c) => (
        <div className="flex items-center gap-2.5">
          <ChampionIcon championId={c.champion_id} size={iconSize} />
          {href ? (
            <a
              href={href(c.champion_id)}
              onClick={(e) => {
                // The row's own click handler opens the champion; the anchor
                // is here so the destination is real, not so it navigates
                e.preventDefault();
              }}
              className="text-[13px] text-lol-text-bright group-hover:text-lol-gold transition-colors whitespace-nowrap"
            >
              {name(c.champion_id)}
            </a>
          ) : (
            <span className="text-[13px] text-lol-text-bright group-hover:text-lol-gold transition-colors whitespace-nowrap">
              {name(c.champion_id)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "tier",
      label: "Tier",
      area: "tier",
      width: "w-16",
      sortValue: (c) => tierSortValue(tiers.get(c.champion_id), score(c.wins, c.games)),
      render: (c) => {
        const tier = tiers.get(c.champion_id);
        return tier ? <TierBadge tier={tier} games={c.games} /> : null;
      },
    },
    {
      key: "score",
      label: "Score",
      area: "score",
      width: "w-[84px]",
      cellClass: "text-[13px] font-semibold text-lol-text-bright",
      sortValue: (c) => score(c.wins, c.games),
      render: (c) => score(c.wins, c.games).toFixed(1),
    },
    {
      key: "winRate",
      label: "Win rate",
      area: "bar",
      width: "w-[150px] min-[1500px]:w-[220px]",
      sortValue: (c) => per(c.wins, c.games),
      render: (c) => <WinRateBar wins={c.wins} total={c.games} />,
    },
    {
      key: "games",
      label: "Games",
      width: "w-[76px]",
      cellClass: "text-[13px] text-lol-text-bright",
      sortValue: (c) => c.games,
      render: (c) => formatWhole(c.games),
    },
    {
      key: "pickRate",
      label: "Pick rate",
      width: "w-[84px]",
      cellClass: "text-[13px] text-lol-text",
      headerTitle: "Share of champion slots under the current filters",
      // Games over a fixed slot total, so this is the games order. The header
      // sorts anyway: one that looks clickable and is not is worse than one
      // that agrees with its neighbour.
      sortValue: (c) => c.games,
      render: (c) => `${(per(c.games, totalSlots) * 100).toFixed(1)}%`,
    },
    ...statColumn("kills", "Kills", (c) => per(c.kills, c.games)),
    ...statColumn("deaths", "Deaths", (c) => per(c.deaths, c.games)),
    ...statColumn("assists", "Assists", (c) => per(c.assists, c.games)),
    {
      key: "kda",
      label: "KDA",
      width: "w-[150px]",
      cellClass: "whitespace-nowrap",
      sortValue: (c) => kdaRatio(c.kills, c.deaths, c.assists),
      render: (c) => {
        const ratio = kdaRatio(c.kills, c.deaths, c.assists);
        return (
          <>
            <span className={`text-[13px] font-semibold ${rampClass(ratio, KDA_RAMP)}`}>
              {ratio.toFixed(2)}
            </span>{" "}
            {/* The split shows here at every width, because the columns that
                carry it separately are the first to drop out */}
            <span className="text-[11px] text-lol-text">
              {per(c.kills, c.games).toFixed(1)} / {per(c.deaths, c.games).toFixed(1)} /{" "}
              {per(c.assists, c.games).toFixed(1)}
            </span>
          </>
        );
      },
    },
    {
      key: "damage",
      label: "Damage",
      width: "w-[84px]",
      cellClass: "text-[13px] text-lol-text",
      sortValue: (c) => c.avg_damage,
      render: (c) => formatWhole(c.avg_damage),
    },
    {
      // Not a detail column, unlike the three above it: nothing else on the
      // board carries gold, so hiding it at 1280px would take something away
      // from the app, which has always shown it. It does leave the card
      // layout, where a fifth figure wrapped the four-up grid onto a second
      // line and made every card a third taller for one number.
      key: "gold",
      label: "Gold",
      area: "none",
      width: "w-[84px]",
      cellClass: "text-[13px] text-lol-text-bright",
      sortValue: (c) => c.avg_gold,
      render: (c) => formatWhole(c.avg_gold),
    },
  ];
}

// Kills, Deaths and Assists as their own columns: the app's, kept, and now
// the site's too. These three are the only ones held back on a narrow window,
// and they are the right three: the KDA column beside them prints the same
// numbers, so nothing is actually lost when they go.
function statColumn(
  key: ChampionSortKey,
  label: string,
  value: (c: BoardChampion) => number,
): BoardColumn<BoardChampion, ChampionSortKey>[] {
  return [
    {
      key,
      label,
      width: "w-[72px]",
      cellClass: "text-[13px] text-lol-text",
      detail: true,
      sortValue: value,
      render: (c) => value(c).toFixed(1),
    },
  ];
}

export type AugmentSortKey =
  | "name"
  | "tier"
  | "score"
  | "winRate"
  | "picks"
  | "pickRate"
  | "kda"
  | "damage";

export interface BoardAugment {
  augment_id: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export function augmentColumns({
  tiers,
  totalSlots,
  name,
  expander,
}: {
  tiers: Map<number, Tier>;
  totalSlots: number;
  name: (augmentId: number) => string;
  // A caret for boards whose rows open in place. Table-only: once the row is
  // a card, the whole card is the tap target.
  expander?: (augment: BoardAugment) => ReactNode;
}): BoardColumn<BoardAugment, AugmentSortKey>[] {
  return [
    ...(expander
      ? ([
          {
            key: null,
            label: "",
            area: "none",
            width: "w-8",
            cellClass: "text-xs text-lol-text",
            render: expander,
          },
        ] as BoardColumn<BoardAugment, AugmentSortKey>[])
      : []),
    {
      key: "name",
      label: "Augment",
      naturalDir: "asc",
      area: "name",
      sortValue: (a) => name(a.augment_id),
      render: (a) => <AugmentIcon augmentId={a.augment_id} size={26} showName />,
    },
    {
      key: "tier",
      label: "Tier",
      area: "tier",
      width: "w-16",
      // Tiers rank an augment against its own rarity, so an S+ Silver and an
      // S+ Prismatic are both S+. Grouping by letter and ordering each group
      // by score is the only tiebreak that means anything here.
      sortValue: (a) => tierSortValue(tiers.get(a.augment_id), score(a.wins, a.picks)),
      render: (a) => {
        const tier = tiers.get(a.augment_id);
        return tier ? <TierBadge tier={tier} games={a.picks} /> : null;
      },
    },
    {
      key: "score",
      label: "Score",
      area: "score",
      width: "w-[84px]",
      cellClass: "text-[13px] font-semibold text-lol-text-bright",
      sortValue: (a) => score(a.wins, a.picks),
      render: (a) => score(a.wins, a.picks).toFixed(1),
    },
    {
      key: "winRate",
      label: "Win rate",
      area: "bar",
      width: "w-[150px] min-[1500px]:w-[220px]",
      sortValue: (a) => per(a.wins, a.picks),
      render: (a) => <WinRateBar wins={a.wins} total={a.picks} />,
    },
    {
      key: "picks",
      label: "Picks",
      width: "w-[76px]",
      cellClass: "text-[13px] text-lol-text-bright",
      sortValue: (a) => a.picks,
      render: (a) => formatWhole(a.picks),
    },
    {
      key: "pickRate",
      label: "Pick rate",
      width: "w-[84px]",
      cellClass: "text-[13px] text-lol-text",
      headerTitle: "Share of champion slots under the current filters",
      sortValue: (a) => a.picks,
      render: (a) => `${(per(a.picks, totalSlots) * 100).toFixed(1)}%`,
    },
    {
      key: "kda",
      label: "KDA",
      width: "w-[76px]",
      sortValue: (a) => kdaRatio(a.kills, a.deaths, a.assists),
      render: (a) => {
        const ratio = kdaRatio(a.kills, a.deaths, a.assists);
        return (
          <span className={`text-[13px] font-semibold ${rampClass(ratio, KDA_RAMP)}`}>
            {ratio.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: "damage",
      label: "Damage",
      width: "w-[84px]",
      cellClass: "text-[13px] text-lol-text",
      sortValue: (a) => per(a.damage, a.picks),
      render: (a) => formatWhole(per(a.damage, a.picks)),
    },
  ];
}
