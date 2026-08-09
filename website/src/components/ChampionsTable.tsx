import { useMemo, useState } from "react";
import type { AugmentStatRow, ChampionStatRow } from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getChampionName } from "../lib/dragon";
import { aggregateChampions, championAugmentBreakdown, type Filters } from "../lib/stats";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import SearchInput from "./SearchInput";
import WinRateBar from "./WinRateBar";

type SortKey = "games" | "pickRate" | "winRate" | "name";
type SortDir = "asc" | "desc";

export default function ChampionsTable({
  rows,
  augmentRows,
  filters,
  totalSlots,
  championData,
  augmentData,
}: {
  rows: ChampionStatRow[];
  augmentRows: AugmentStatRow[];
  filters: Filters;
  totalSlots: number;
  championData: ChampionData;
  augmentData: AugmentData;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("games");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    let list = aggregateChampions(rows, filters);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        getChampionName(championData, c.champion_id).toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortKey === "name") {
        const cmp = getChampionName(championData, a.champion_id).localeCompare(
          getChampionName(championData, b.champion_id),
        );
        return sortDir === "asc" ? cmp : -cmp;
      }
      let av: number, bv: number;
      if (sortKey === "winRate") {
        av = a.games > 0 ? a.wins / a.games : 0;
        bv = b.games > 0 ? b.wins / b.games : 0;
      } else {
        av = a.games;
        bv = b.games;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [rows, filters, search, sortKey, sortDir, championData]);

  const SortHeader = ({ label, field, className }: { label: string; field: SortKey; className?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider cursor-pointer hover:text-lol-gold select-none whitespace-nowrap ${className ?? ""}`}
    >
      {label} {sortKey === field ? (sortDir === "desc" ? "▼" : "▲") : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-lol-text">{sorted.length} champions</span>
        <SearchInput value={search} onChange={setSearch} placeholder="Search champion..." />
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="bg-lol-dark/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider w-10">
                #
              </th>
              <SortHeader label="Champion" field="name" />
              <SortHeader label="Games" field="games" />
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider whitespace-nowrap">
                Pick Rate
              </th>
              <SortHeader label="Win Rate" field="winRate" className="w-36" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const pickRate = totalSlots > 0 ? ((c.games / totalSlots) * 100).toFixed(1) : "0.0";
              const expanded = expandedId === c.champion_id;
              return (
                <ChampionRow
                  key={c.champion_id}
                  index={i}
                  champ={c}
                  pickRate={pickRate}
                  expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : c.champion_id)}
                  augmentRows={augmentRows}
                  filters={filters}
                  championData={championData}
                  augmentData={augmentData}
                />
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">No champions found</div>
        )}
      </div>
      <p className="text-xs text-lol-text/70">* fewer than 20 games — treat with caution</p>
    </div>
  );
}

function ChampionRow({
  index,
  champ,
  pickRate,
  expanded,
  onToggle,
  augmentRows,
  filters,
  championData,
  augmentData,
}: {
  index: number;
  champ: { champion_id: number; games: number; wins: number };
  pickRate: string;
  expanded: boolean;
  onToggle: () => void;
  augmentRows: AugmentStatRow[];
  filters: Filters;
  championData: ChampionData;
  augmentData: AugmentData;
}) {
  const breakdown = useMemo(
    () => (expanded ? championAugmentBreakdown(augmentRows, filters, champ.champion_id).slice(0, 8) : []),
    [expanded, augmentRows, filters, champ.champion_id],
  );

  return (
    <>
      <tr
        onClick={onToggle}
        className="group border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
      >
        <td className="px-3 py-2 text-xs text-lol-text">{index + 1}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <ChampionIcon championId={champ.champion_id} size={28} />
            <span className="text-sm text-lol-text-bright group-hover:text-lol-gold transition-colors">
              {getChampionName(championData, champ.champion_id)}
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-sm text-lol-text-bright">{champ.games}</td>
        <td className="px-3 py-2 text-sm text-lol-text">{pickRate}%</td>
        <td className="px-3 py-2 w-36">
          <WinRateBar wins={champ.wins} total={champ.games} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-lol-border/30 bg-lol-dark/40">
          <td colSpan={5} className="px-4 py-3">
            <p className="text-xs text-lol-text uppercase tracking-wider mb-2">
              Most-picked augments on {getChampionName(championData, champ.champion_id)}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {breakdown.map((a) => (
                <div key={a.augment_id} className="flex items-center gap-2">
                  <div className="w-40 min-w-0">
                    <AugmentIcon augmentData={augmentData} augmentId={a.augment_id} size={22} showName />
                  </div>
                  <span className="text-xs text-lol-text w-14">{a.picks} picks</span>
                  <div className="flex-1 max-w-40">
                    <WinRateBar wins={a.wins} total={a.picks} />
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
