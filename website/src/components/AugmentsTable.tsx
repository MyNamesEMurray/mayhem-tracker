import { useMemo, useState } from "react";
import type { AugmentStatRow } from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getAugmentName, getChampionName } from "../lib/dragon";
import {
  aggregateAugments,
  augmentChampionBreakdown,
  type Filters,
} from "../lib/stats";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import RarityFilter, { type Rarity } from "./RarityFilter";
import SearchInput from "./SearchInput";
import WinRateBar from "./WinRateBar";

type SortKey = "picks" | "pickRate" | "winRate" | "name";
type SortDir = "asc" | "desc";

export default function AugmentsTable({
  rows,
  filters,
  totalSlots,
  augmentData,
  championData,
}: {
  rows: AugmentStatRow[];
  filters: Filters;
  totalSlots: number;
  augmentData: AugmentData;
  championData: ChampionData;
}) {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<Rarity>("all");
  const [sortKey, setSortKey] = useState<SortKey>("picks");
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
    let list = aggregateAugments(rows, filters);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) => getAugmentName(augmentData, a.augment_id).toLowerCase().includes(q));
    }
    if (rarity !== "all") {
      list = list.filter((a) => augmentData[a.augment_id]?.rarity === rarity);
    }
    list.sort((a, b) => {
      if (sortKey === "name") {
        const cmp = getAugmentName(augmentData, a.augment_id).localeCompare(
          getAugmentName(augmentData, b.augment_id),
        );
        return sortDir === "asc" ? cmp : -cmp;
      }
      let av: number, bv: number;
      if (sortKey === "winRate") {
        av = a.picks > 0 ? a.wins / a.picks : 0;
        bv = b.picks > 0 ? b.wins / b.picks : 0;
      } else {
        av = a.picks;
        bv = b.picks;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [rows, filters, search, rarity, sortKey, sortDir, augmentData]);

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
      <div className="flex flex-wrap items-center gap-2">
        <RarityFilter value={rarity} onChange={setRarity} />
        <span className="text-xs text-lol-text self-center ml-1">{sorted.length} augments</span>
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Search augment..." />
        </div>
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="bg-lol-dark/50">
            <tr>
              <SortHeader label="Augment" field="name" />
              <SortHeader label="Picks" field="picks" />
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider whitespace-nowrap">
                Pick Rate
              </th>
              <SortHeader label="Win Rate" field="winRate" className="w-36" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const pickRate = totalSlots > 0 ? ((a.picks / totalSlots) * 100).toFixed(1) : "0.0";
              const expanded = expandedId === a.augment_id;
              return (
                <AugmentRow
                  key={a.augment_id}
                  aug={a}
                  pickRate={pickRate}
                  expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : a.augment_id)}
                  rows={rows}
                  filters={filters}
                  augmentData={augmentData}
                  championData={championData}
                />
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">No augments found</div>
        )}
      </div>
      <p className="text-xs text-lol-text/70">* fewer than 20 games — treat with caution</p>
    </div>
  );
}

function AugmentRow({
  aug,
  pickRate,
  expanded,
  onToggle,
  rows,
  filters,
  augmentData,
  championData,
}: {
  aug: { augment_id: number; picks: number; wins: number };
  pickRate: string;
  expanded: boolean;
  onToggle: () => void;
  rows: AugmentStatRow[];
  filters: Filters;
  augmentData: AugmentData;
  championData: ChampionData;
}) {
  const breakdown = useMemo(
    () => (expanded ? augmentChampionBreakdown(rows, filters, aug.augment_id).slice(0, 8) : []),
    [expanded, rows, filters, aug.augment_id],
  );

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
      >
        <td className="px-3 py-2">
          <AugmentIcon augmentData={augmentData} augmentId={aug.augment_id} showName />
        </td>
        <td className="px-3 py-2 text-sm text-lol-text-bright">{aug.picks}</td>
        <td className="px-3 py-2 text-sm text-lol-text">{pickRate}%</td>
        <td className="px-3 py-2 w-36">
          <WinRateBar wins={aug.wins} total={aug.picks} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-lol-border/30 bg-lol-dark/40">
          <td colSpan={4} className="px-4 py-3">
            <p className="text-xs text-lol-text uppercase tracking-wider mb-2">
              Best with ({getAugmentName(augmentData, aug.augment_id)})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {breakdown.map((c) => (
                <div key={c.champion_id} className="flex items-center gap-2">
                  <ChampionIcon championId={c.champion_id} size={22} />
                  <span className="text-xs text-lol-text-bright w-24 truncate">
                    {getChampionName(championData, c.champion_id)}
                  </span>
                  <span className="text-xs text-lol-text w-14">{c.picks} picks</span>
                  <div className="flex-1 max-w-40">
                    <WinRateBar wins={c.wins} total={c.picks} />
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
