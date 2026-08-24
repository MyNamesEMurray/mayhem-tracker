import { useMemo, useState } from "react";
import type { ChampionStatRow } from "../lib/api";
import type { ChampionData } from "../lib/dragon";
import { getChampionName } from "../lib/dragon";
import {
  aggregateChampions,
  assignTiers,
  formatCompact,
  kdaRampClass,
  kdaRatio,
  score,
  type Filters,
} from "../lib/stats";
import ChampionIcon from "./ChampionIcon";
import SearchInput from "./SearchInput";
import TierBadge from "./TierBadge";
import WinRateBar from "./WinRateBar";
import { championSlug } from "../lib/slug";

type SortKey = "score" | "games" | "winRate" | "kda" | "damage" | "name";
type SortDir = "asc" | "desc";

export default function ChampionsTable({
  rows,
  filters,
  totalSlots,
  minGames = 0,
  confidentOnly = false,
  onToggleConfident,
  championData,
  onSelectChampion,
}: {
  rows: ChampionStatRow[];
  filters: Filters;
  totalSlots: number;
  minGames?: number;
  confidentOnly?: boolean;
  onToggleConfident?: () => void;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  // Tiers are ranked across ALL champions under the current filter, before
  // search narrows the list — searching "teemo" must not make Teemo S+
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
    // Tier assignment above still sees the full cohort — hiding low-sample
    // rows must not promote what remains
    let filtered = minGames > 0 ? list.filter((c) => c.games >= minGames) : list;
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
  }, [list, search, sortKey, sortDir, championData, minGames]);

  const th =
    "px-3 py-[9px] text-left text-[11px] font-medium uppercase tracking-[.08em] select-none";
  const SortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: SortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleSort(field)}
      className={`${th} cursor-pointer whitespace-nowrap ${
        sortKey === field ? "text-lol-gold" : "text-lol-text hover:text-lol-gold"
      } ${className ?? ""}`}
    >
      {label} {sortKey === field ? (sortDir === "desc" ? "▼" : "▲") : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {onToggleConfident && (
          <button
            onClick={onToggleConfident}
            aria-pressed={confidentOnly}
            title="Hide results with fewer than 20 games (the ones marked with *)"
            className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
              confidentOnly
                ? "bg-lol-gold/15 text-lol-gold border-lol-gold/50"
                : "text-lol-text border-lol-border bg-lol-card hover:border-lol-gold/40"
            }`}
          >
            20+ games
          </button>
        )}
        <span className="text-xs">{sorted.length} champions — click one for its ideal build</span>
        <div className="ml-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search champion..."
            width={190}
          />
        </div>
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-x-auto">
        <table className="ctbl table-fixed w-full min-w-[1000px] border-collapse">
          <thead className="bg-lol-dark/50">
            <tr>
              <th className={`${th} text-lol-text w-10`}>#</th>
              <SortHeader label="Champion" field="name" />
              <th className={`${th} text-lol-text w-16`}>Tier</th>
              <SortHeader label="Score" field="score" className="w-[84px]" />
              <SortHeader label="Win rate" field="winRate" className="w-[150px]" />
              <SortHeader label="Games" field="games" className="w-[76px]" />
              <th className={`${th} text-lol-text w-[84px] whitespace-nowrap`}>Pick rate</th>
              <SortHeader label="KDA" field="kda" className="w-[170px]" />
              <SortHeader label="Damage" field="damage" className="w-[84px]" />
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
                    {c.games}
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
                    {formatCompact(games > 0 ? c.damage / games : 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">
            {minGames > 0 && list.length > 0
              ? "No champions with 20+ games under these filters — try a wider patch range or turn off the 20+ filter"
              : "No champions found"}
          </div>
        )}
      </div>
      <p className="text-xs text-lol-text/70">
        Score is the win rate adjusted toward 50% for small samples; tiers rank Score across the
        current filter. * fewer than 20 games — treat with caution.
      </p>
    </div>
  );
}
