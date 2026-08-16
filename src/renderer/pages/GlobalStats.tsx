import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useUrlStatsFilters } from "../hooks/useStatsFilters";
import {
  useChampionData,
  getChampionName,
  useAugmentData,
  getAugmentName,
} from "../hooks/useChampions";
import type { GlobalStats } from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import AugmentIcon from "../components/AugmentIcon";
import WinRateBar from "../components/WinRateBar";
import PatchSelect from "../components/PatchSelect";
import QueueSelect from "../components/QueueSelect";
import RarityFilter, { type Rarity } from "../components/RarityFilter";

type Tab = "champions" | "augments";
type ChampSortKey = "games" | "winRate" | "pickRate" | "name";
type AugSortKey = "picks" | "winRate" | "pickRate" | "name";
type SortDir = "asc" | "desc";

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input w-48 pr-7"
      />
      {value && (
        <button
          onClick={() => onChange("")}
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
  );
}

export default function GlobalStats() {
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const navigate = useNavigate();
  // Filters and tab live in the URL so returning from a champion page lands
  // back on the same view. filterQuery is carried into the champion page so
  // it opens with the same filters, and comes back on its back link.
  const [searchParams, setSearchParams] = useSearchParams();
  const { patch, setPatch, queue, setQueue, filterQuery } = useUrlStatsFilters();
  const tab: Tab = searchParams.get("tab") === "augments" ? "augments" : "champions";

  const setTab = (t: Tab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === "champions") next.delete("tab");
        else next.set("tab", t);
        return next;
      },
      { replace: true },
    );
  };

  const { data, refetch } = useIpc<GlobalStats>(
    () => window.api.getGlobalStats(patch, queue),
    [patch, queue],
  );

  // Champion tab state
  const [champSearch, setChampSearch] = useState("");
  const [champSortKey, setChampSortKey] = useState<ChampSortKey>("games");
  const [champSortDir, setChampSortDir] = useState<SortDir>("desc");

  // Augment tab state
  const [augSearch, setAugSearch] = useState("");
  const [augSortKey, setAugSortKey] = useState<AugSortKey>("picks");
  const [augSortDir, setAugSortDir] = useState<SortDir>("desc");
  const [rarityFilter, setRarityFilter] = useState<Rarity>("all");

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const totalGames = data ? Math.round(data.totalParticipantSlots / 10) : 0;

  const handleChampSort = (key: ChampSortKey) => {
    if (champSortKey === key) {
      setChampSortDir(champSortDir === "desc" ? "asc" : "desc");
    } else {
      setChampSortKey(key);
      setChampSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const handleAugSort = (key: AugSortKey) => {
    if (augSortKey === key) {
      setAugSortDir(augSortDir === "desc" ? "asc" : "desc");
    } else {
      setAugSortKey(key);
      setAugSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortedChampions = useMemo(() => {
    if (!data) return [];
    let filtered = data.champions.filter((c) => {
      const name = getChampionName(champData, c.champion_id).toLowerCase();
      return name.includes(champSearch.toLowerCase());
    });

    filtered.sort((a, b) => {
      let av: number, bv: number;
      if (champSortKey === "name") {
        const nameA = getChampionName(champData, a.champion_id);
        const nameB = getChampionName(champData, b.champion_id);
        const cmp = nameA.localeCompare(nameB);
        return champSortDir === "asc" ? cmp : -cmp;
      } else if (champSortKey === "winRate") {
        av = a.games > 0 ? a.wins / a.games : 0;
        bv = b.games > 0 ? b.wins / b.games : 0;
      } else if (champSortKey === "pickRate") {
        av = data.totalParticipantSlots > 0 ? a.games / data.totalParticipantSlots : 0;
        bv = data.totalParticipantSlots > 0 ? b.games / data.totalParticipantSlots : 0;
      } else {
        av = a.games;
        bv = b.games;
      }
      return champSortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, champSearch, champSortKey, champSortDir, champData]);

  const sortedAugments = useMemo(() => {
    if (!data) return [];
    let filtered = data.augments.filter((a) => {
      const name = getAugmentName(augmentData, a.augment_id).toLowerCase();
      if (!name.includes(augSearch.toLowerCase())) return false;
      if (rarityFilter !== "all" && augmentData[a.augment_id]?.rarity !== rarityFilter)
        return false;
      return true;
    });

    filtered.sort((a, b) => {
      let av: number, bv: number;
      if (augSortKey === "name") {
        const nameA = getAugmentName(augmentData, a.augment_id);
        const nameB = getAugmentName(augmentData, b.augment_id);
        const cmp = nameA.localeCompare(nameB);
        return augSortDir === "asc" ? cmp : -cmp;
      } else if (augSortKey === "winRate") {
        av = a.picks > 0 ? a.wins / a.picks : 0;
        bv = b.picks > 0 ? b.wins / b.picks : 0;
      } else if (augSortKey === "pickRate") {
        av = data!.totalParticipantSlots > 0 ? a.picks / data!.totalParticipantSlots : 0;
        bv = data!.totalParticipantSlots > 0 ? b.picks / data!.totalParticipantSlots : 0;
      } else {
        av = a.picks;
        bv = b.picks;
      }
      return augSortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, augSearch, augSortKey, augSortDir, augmentData, rarityFilter]);

  if (!data) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  const ChampSortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: ChampSortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleChampSort(field)}
      className={`px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] cursor-pointer hover:text-lol-gold select-none whitespace-nowrap ${
        champSortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {champSortKey === field ? (champSortDir === "desc" ? "\u25BC" : "\u25B2") : ""}
    </th>
  );

  const AugSortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: AugSortKey;
    className?: string;
  }) => (
    <th
      onClick={() => handleAugSort(field)}
      className={`px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] cursor-pointer hover:text-lol-gold select-none whitespace-nowrap ${
        augSortKey === field ? "text-lol-gold" : "text-lol-text"
      } ${className ?? ""}`}
    >
      {label} {augSortKey === field ? (augSortDir === "desc" ? "\u25BC" : "\u25B2") : ""}
    </th>
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-lol-text-bright">Global Stats</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-lol-text">
            {totalGames} games &middot; {data.champions.length} champions &middot;{" "}
            {data.augments.length} augments
          </span>
          <QueueSelect value={queue} onChange={setQueue} />
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("champions")}
          className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
            tab === "champions"
              ? "bg-lol-gold/15 text-lol-gold border-lol-gold/50"
              : "text-lol-text border-lol-border bg-lol-dark hover:border-lol-gold/50"
          }`}
        >
          Champions
        </button>
        <button
          onClick={() => setTab("augments")}
          className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
            tab === "augments"
              ? "bg-lol-gold/15 text-lol-gold border-lol-gold/50"
              : "text-lol-text border-lol-border bg-lol-dark hover:border-lol-gold/50"
          }`}
        >
          Augments
        </button>
      </div>

      {tab === "champions" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-lol-text">{sortedChampions.length} champions</span>
            <SearchInput
              value={champSearch}
              onChange={setChampSearch}
              placeholder="Search champion..."
            />
          </div>

          <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
            <table className="w-full">
              <thead className="bg-lol-dark/50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em] w-12">
                    #
                  </th>
                  <ChampSortHeader label="Champion" field="name" />
                  <ChampSortHeader label="Games" field="games" />
                  <ChampSortHeader label="Pick Rate" field="pickRate" />
                  <ChampSortHeader label="Win Rate" field="winRate" className="w-32" />
                </tr>
              </thead>
              <tbody>
                {sortedChampions.map((c, i) => {
                  const pickRate =
                    data.totalParticipantSlots > 0
                      ? ((c.games / data.totalParticipantSlots) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <tr
                      key={c.champion_id}
                      onClick={() => navigate(`/global/champion/${c.champion_id}${filterQuery}`)}
                      className="group border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-1.5 text-xs text-lol-text">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <ChampionIcon championId={c.champion_id} size={28} />
                          <span className="text-sm text-lol-text-bright group-hover:text-lol-gold transition-colors">
                            {getChampionName(champData, c.champion_id)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-sm text-lol-text-bright">{c.games}</td>
                      <td className="px-3 py-1.5 text-sm text-lol-text">{pickRate}%</td>
                      <td className="px-3 py-1.5 w-32">
                        <WinRateBar wins={c.wins} total={c.games} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedChampions.length === 0 && (
              <div className="py-8 text-center text-sm text-lol-text">No champions found</div>
            )}
          </div>
        </>
      )}

      {tab === "augments" && (
        <>
          <div className="flex items-center gap-2">
            <RarityFilter value={rarityFilter} onChange={setRarityFilter} />
            <span className="text-xs text-lol-text self-center ml-2">
              {sortedAugments.length} augments
            </span>
            <div className="ml-auto">
              <SearchInput
                value={augSearch}
                onChange={setAugSearch}
                placeholder="Search augment..."
              />
            </div>
          </div>

          <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
            <table className="w-full">
              <thead className="bg-lol-dark/50">
                <tr>
                  <AugSortHeader label="Augment" field="name" />
                  <AugSortHeader label="Picks" field="picks" />
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em]">
                    Pick Rate
                  </th>
                  <AugSortHeader label="Win Rate" field="winRate" className="w-32" />
                </tr>
              </thead>
              <tbody>
                {sortedAugments.map((a) => {
                  const pickRate =
                    data.totalParticipantSlots > 0
                      ? ((a.picks / data.totalParticipantSlots) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <tr
                      key={a.augment_id}
                      className="border-t border-lol-border/50 hover:bg-lol-card-hover transition-colors"
                    >
                      <td className="px-3 py-1.5">
                        <AugmentIcon augmentId={a.augment_id} showName />
                      </td>
                      <td className="px-3 py-1.5 text-sm text-lol-text-bright">{a.picks}</td>
                      <td className="px-3 py-1.5 text-sm text-lol-text">{pickRate}%</td>
                      <td className="px-3 py-1.5 w-32">
                        <WinRateBar wins={a.wins} total={a.picks} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedAugments.length === 0 && (
              <div className="py-8 text-center text-sm text-lol-text">No augments found</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
