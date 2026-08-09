import { useState, useMemo, useEffect } from "react";
import { useIpc } from "../hooks/useIpc";
import {
  useChampionData,
  getChampionName,
  useAugmentData,
  getAugmentName,
} from "../hooks/useChampions";
import type { AugmentStatsDetailed } from "../lib/types";
import AugmentIcon from "../components/AugmentIcon";
import ChampionIcon from "../components/ChampionIcon";
import WinRateBar from "../components/WinRateBar";
import PatchSelect from "../components/PatchSelect";
import QueueSelect from "../components/QueueSelect";
import RarityFilter, { type Rarity } from "../components/RarityFilter";

type SortKey = "picks" | "winRate" | "name";
type SortDir = "asc" | "desc";

export default function Augments() {
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const [patch, setPatch] = useState<string | undefined>(undefined);
  const [queue, setQueue] = useState<number | undefined>(undefined);
  const { data, refetch } = useIpc<AugmentStatsDetailed[]>(
    () => window.api.getAugmentStatsDetailed(patch, queue),
    [patch, queue],
  );
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("picks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rarityFilter, setRarityFilter] = useState<Rarity>("all");

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const totalGames = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const totalPicks = data.reduce((sum, a) => sum + a.picks, 0);
    return Math.round(totalPicks / 4);
  }, [data]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const toggleExpand = (augmentId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(augmentId)) next.delete(augmentId);
      else next.add(augmentId);
      return next;
    });
  };

  const sorted = useMemo(() => {
    if (!data) return [];
    let filtered = data.filter((a) => {
      const aug = augmentData[a.augment_id];
      const name = getAugmentName(augmentData, a.augment_id).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
      if (rarityFilter !== "all" && aug?.rarity !== rarityFilter) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "name") {
        const nameA = getAugmentName(augmentData, a.augment_id);
        const nameB = getAugmentName(augmentData, b.augment_id);
        const cmp = nameA.localeCompare(nameB);
        return sortDir === "asc" ? cmp : -cmp;
      } else if (sortKey === "winRate") {
        av = a.picks > 0 ? a.wins / a.picks : 0;
        bv = b.picks > 0 ? b.wins / b.picks : 0;
      } else {
        av = a.picks;
        bv = b.picks;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, search, sortKey, sortDir, augmentData, rarityFilter]);

  if (!data) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

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
      className={`px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] cursor-pointer hover:text-lol-gold select-none whitespace-nowrap ${
        sortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {sortKey === field ? (sortDir === "desc" ? "▼" : "▲") : ""}
    </th>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-bold text-lol-text-bright">Augments</h1>

      {/* Rarity Filter + Search */}
      <div className="flex items-center gap-2">
        <RarityFilter value={rarityFilter} onChange={setRarityFilter} />
        <span className="text-xs text-lol-text self-center ml-2">{sorted.length} augments</span>
        <div className="ml-auto flex items-center gap-2">
          <QueueSelect value={queue} onChange={setQueue} />
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search augment..."
            className="input w-48 pr-7"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-lol-text/50 hover:text-lol-text-bright transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm2.78-4.22a.75.75 0 0 1-1.06 0L8 9.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L6.94 8 5.22 6.28a.75.75 0 0 1 1.06-1.06L8 6.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L9.06 8l1.72 1.72a.75.75 0 0 1 0 1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-lol-dark/50">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em] w-8"></th>
              <SortHeader label="Augment" field="name" />
              <SortHeader label="Picks" field="picks" />
              <th className="px-3 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em]">
                Pick Rate
              </th>
              <SortHeader label="Win Rate" field="winRate" className="w-32" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const isExpanded = expanded.has(a.augment_id);
              const pickRate = totalGames > 0 ? ((a.picks / totalGames) * 100).toFixed(1) : "0.0";
              return (
                <>
                  <tr
                    key={a.augment_id}
                    onClick={() => toggleExpand(a.augment_id)}
                    className="border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-1.5 text-xs text-lol-text">
                      <span
                        className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <AugmentIcon augmentId={a.augment_id} showName />
                    </td>
                    <td className="px-3 py-1.5 text-sm text-lol-text-bright">{a.picks}</td>
                    <td className="px-3 py-1.5 text-sm text-lol-text">{pickRate}%</td>
                    <td className="px-3 py-1.5 w-32">
                      <WinRateBar wins={a.wins} total={a.picks} />
                    </td>
                  </tr>
                  {isExpanded &&
                    a.champions.map((c) => (
                      <tr
                        key={`${a.augment_id}-${c.champion_id}`}
                        className="border-t border-lol-border/30 bg-lol-dark/30"
                      >
                        <td></td>
                        <td className="px-3 py-1.5 pl-8">
                          <div className="flex items-center gap-2">
                            <ChampionIcon championId={c.champion_id} size={22} />
                            <span className="text-xs text-lol-text">
                              {getChampionName(champData, c.champion_id)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-lol-text">{c.picks}</td>
                        <td></td>
                        <td className="px-3 py-1.5 w-32">
                          <WinRateBar wins={c.wins} total={c.picks} />
                        </td>
                      </tr>
                    ))}
                </>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">No augments found</div>
        )}
      </div>
    </div>
  );
}
