import { useMemo, useState } from "react";
import { PANEL } from "../../../src/shared/ui/primitives.tsx";
import type { ChampionStatRow } from "../lib/api";
import type { ChampionData } from "../lib/dragon";
import { getChampionName } from "../lib/dragon";
import {
  aggregateChampions,
  assignTiers,
  formatWhole,
  kdaRampClass,
  kdaRatio,
  score,
  type Filters,
} from "../lib/stats";
import ChampionIcon from "../../../src/shared/ui/ChampionIcon.tsx";
import SearchField from "../../../src/shared/ui/SearchField.tsx";
import TierBadge from "../../../src/shared/ui/TierBadge.tsx";
import WinRateBar from "../../../src/shared/ui/WinRateBar.tsx";
import { championSlug } from "../lib/slug";
import SortHeader, { useSort } from "../../../src/shared/ui/SortHeader.tsx";
import SortControl, { type SortOption } from "./SortControl";
import { TIER_ORDER } from "../lib/stats";

// Every column carries data, so every column sorts. Pick rate is games over a
// fixed total, so it orders identically to games - it's here because a header
// that looks clickable and isn't is worse than a redundant one.
type SortKey = "score" | "games" | "winRate" | "kda" | "damage" | "name" | "tier" | "pickRate";

export default function ChampionsTable({
  rows,
  filters,
  totalSlots,
  championData,
  onSelectChampion,
}: {
  rows: ChampionStatRow[];
  filters: Filters;
  totalSlots: number;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const { sort, toggle } = useSort<SortKey>("score");
  const { key: sortKey, dir: sortDir } = sort;

  // Tiers are ranked across ALL champions under the current filter, before
  // search narrows the list - searching "teemo" must not make Teemo S+
  const { list, tiers } = useMemo(() => {
    const list = aggregateChampions(rows, filters);
    const tiers = assignTiers(
      list,
      (c) => score(c.wins, c.games),
      (c) => c.champion_id,
    );
    return { list, tiers };
  }, [rows, filters]);

  const sorted = useMemo(() => {
    // Tier assignment above still sees the full cohort - hiding low-sample
    // rows must not promote what remains
    let filtered = list;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) =>
        getChampionName(championData, c.champion_id).toLowerCase().includes(q),
      );
    }
    const result = [...filtered];
    result.sort((a, b) => {
      if (sortKey === "name") {
        const cmp = getChampionName(championData, a.champion_id).localeCompare(
          getChampionName(championData, b.champion_id),
        );
        return sortDir === "asc" ? cmp : -cmp;
      }
      let av: number, bv: number;
      if (sortKey === "score") {
        av = score(a.wins, a.games);
        bv = score(b.wins, b.games);
      } else if (sortKey === "tier") {
        // S+ first descending. Tiers are wide - a third of the roster is one
        // letter - so score breaks the ties and the order inside a tier still
        // means something.
        const at = TIER_ORDER.indexOf(tiers.get(a.champion_id)!);
        const bt = TIER_ORDER.indexOf(tiers.get(b.champion_id)!);
        if (at !== bt) return sortDir === "desc" ? at - bt : bt - at;
        av = score(a.wins, a.games);
        bv = score(b.wins, b.games);
      } else if (sortKey === "pickRate") {
        av = a.games;
        bv = b.games;
      } else if (sortKey === "winRate") {
        av = a.games > 0 ? a.wins / a.games : 0;
        bv = b.games > 0 ? b.wins / b.games : 0;
      } else if (sortKey === "kda") {
        av = kdaRatio(a.kills, a.deaths, a.assists);
        bv = kdaRatio(b.kills, b.deaths, b.assists);
      } else if (sortKey === "damage") {
        av = a.games > 0 ? a.damage / a.games : 0;
        bv = b.games > 0 ? b.damage / b.games : 0;
      } else {
        av = a.games;
        bv = b.games;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return result;
  }, [list, tiers, search, sortKey, sortDir, championData]);

  const th =
    "px-3 py-[9px] text-left text-[11px] font-medium uppercase tracking-[.08em] select-none";
  const sortProps = { sort, onSort: toggle, thClass: th };

  // Same columns as the header row, for the card layout that has no header row
  const sortOptions: SortOption<SortKey>[] = [
    { key: "score", label: "Score" },
    { key: "name", label: "Champion", naturalDir: "asc" },
    { key: "tier", label: "Tier" },
    { key: "winRate", label: "Win rate" },
    { key: "games", label: "Games" },
    { key: "pickRate", label: "Pick rate" },
    { key: "kda", label: "KDA" },
    { key: "damage", label: "Damage" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs">
          {sorted.length} champion{sorted.length === 1 ? "" : "s"}
        </span>
        <SortControl options={sortOptions} sort={sort} onSort={toggle} />
        <div className="ml-auto">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search champion..."
            width={192}
          />
        </div>
      </div>

      <div className={`${PANEL} overflow-x-auto`}>
        <table className="ctbl table-fixed w-full min-w-[1000px] border-collapse">
          <thead className="bg-lol-dark/50">
            <tr>
              {/* The rank column is the row's position in whatever order is
                  showing, so there is nothing to sort it by */}
              <th className={`${th} text-lol-text w-10`}>#</th>
              <SortHeader label="Champion" field="name" naturalDir="asc" {...sortProps} />
              <SortHeader label="Tier" field="tier" className="w-16" {...sortProps} />
              <SortHeader label="Score" field="score" className="w-[84px]" {...sortProps} />
              <SortHeader label="Win rate" field="winRate" className="w-[150px]" {...sortProps} />
              <SortHeader label="Games" field="games" className="w-[76px]" {...sortProps} />
              <SortHeader label="Pick rate" field="pickRate" className="w-[84px]" {...sortProps} />
              <SortHeader label="KDA" field="kda" className="w-[170px]" {...sortProps} />
              <SortHeader label="Damage" field="damage" className="w-[84px]" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const games = c.games;
              const avgK = games > 0 ? c.kills / games : 0;
              const avgD = games > 0 ? c.deaths / games : 0;
              const avgA = games > 0 ? c.assists / games : 0;
              const ratio = kdaRatio(c.kills, c.deaths, c.assists);
              const pickRate = totalSlots > 0 ? ((c.games / totalSlots) * 100).toFixed(1) : "0.0";
              return (
                <tr
                  key={c.champion_id}
                  onClick={() => onSelectChampion(c.champion_id)}
                  className="group border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
                >
                  <td className="px-3 py-[9px] text-xs text-lol-text">{i + 1}</td>
                  <td className="px-3 py-[9px]">
                    <div className="flex items-center gap-2.5">
                      <ChampionIcon championId={c.champion_id} size={28} />
                      <a
                        href={`/champion/${championSlug(getChampionName(championData, c.champion_id))}/`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectChampion(c.champion_id);
                        }}
                        className="text-[13px] text-lol-text-bright group-hover:text-lol-gold transition-colors whitespace-nowrap"
                      >
                        {getChampionName(championData, c.champion_id)}
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-[9px]">
                    <TierBadge tier={tiers.get(c.champion_id)!} games={c.games} />
                  </td>
                  <td className="px-3 py-[9px] text-[13px] font-semibold text-lol-text-bright">
                    {score(c.wins, c.games).toFixed(1)}
                  </td>
                  <td className="px-3 py-[9px]">
                    <WinRateBar wins={c.wins} total={c.games} />
                  </td>
                  <td
                    className="px-3 py-[9px] text-[13px] text-lol-text-bright"
                    title={`${pickRate}% of participant slots`}
                  >
                    {formatWhole(c.games)}
                  </td>
                  <td className="px-3 py-[9px] text-[13px] text-lol-text">{pickRate}%</td>
                  <td className="px-3 py-[9px] whitespace-nowrap">
                    <span className={`text-[13px] font-semibold ${kdaRampClass(ratio)}`}>
                      {ratio.toFixed(2)}
                    </span>{" "}
                    <span className="text-[11px] text-lol-text">
                      {avgK.toFixed(1)} / {avgD.toFixed(1)} / {avgA.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-[9px] text-[13px] text-lol-text">
                    {formatWhole(games > 0 ? c.damage / games : 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">"No champions found"</div>
        )}
      </div>
      <p className="text-xs text-lol-text/70">
        Score is the win rate the record supports, out of 100 - the floor of a 95% confidence
        interval, so a thin sample scores well below the rate it happened to produce. Tiers rank
        Score across the current filter. * fewer than 20 games - treat with caution.
      </p>
    </div>
  );
}
