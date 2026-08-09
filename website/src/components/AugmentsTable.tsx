import { useMemo, useState } from "react";
import type { AugmentStatRow } from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getAugmentName, getChampionName } from "../lib/dragon";
import {
  aggregateAugments,
  assignTiers,
  augmentChampionBreakdown,
  formatCompact,
  kdaRatio,
  score,
  type Filters,
  type Tier,
} from "../lib/stats";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import RarityFilter, { type Rarity } from "./RarityFilter";
import SearchInput from "./SearchInput";
import TierBadge from "./TierBadge";
import WinRateBar from "./WinRateBar";

type SortKey = "score" | "picks" | "winRate" | "kda" | "damage" | "name";
type SortDir = "asc" | "desc";

export default function AugmentsTable({
  rows,
  filters,
  totalSlots,
  augmentData,
  championData,
  onSelectChampion,
}: {
  rows: AugmentStatRow[];
  filters: Filters;
  totalSlots: number;
  augmentData: AugmentData;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<Rarity>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
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

  // Tiers rank each augment against its own rarity — Prismatics are strictly
  // stronger than Silvers, so a global ranking would just sort by rarity.
  // Computed before search/rarity narrowing so filtering never reshuffles.
  const { list, tiers } = useMemo(() => {
    const list = aggregateAugments(rows, filters);
    const byRarity = new Map<string, typeof list>();
    for (const a of list) {
      const r = augmentData[a.augment_id]?.rarity ?? "unknown";
      let group = byRarity.get(r);
      if (!group) byRarity.set(r, (group = []));
      group.push(a);
    }
    const tiers = new Map<number, Tier>();
    for (const group of byRarity.values()) {
      for (const [id, tier] of assignTiers(
        group,
        (a) => score(a.wins, a.picks),
        (a) => a.augment_id,
      )) {
        tiers.set(id, tier);
      }
    }
    return { list, tiers };
  }, [rows, filters, augmentData]);

  const sorted = useMemo(() => {
    let filtered = list;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((a) =>
        getAugmentName(augmentData, a.augment_id).toLowerCase().includes(q),
      );
    }
    if (rarity !== "all") {
      filtered = filtered.filter((a) => augmentData[a.augment_id]?.rarity === rarity);
    }
    const result = [...filtered];
    result.sort((a, b) => {
      if (sortKey === "name") {
        const cmp = getAugmentName(augmentData, a.augment_id).localeCompare(
          getAugmentName(augmentData, b.augment_id),
        );
        return sortDir === "asc" ? cmp : -cmp;
      }
      let av: number, bv: number;
      if (sortKey === "score") {
        av = score(a.wins, a.picks);
        bv = score(b.wins, b.picks);
      } else if (sortKey === "winRate") {
        av = a.picks > 0 ? a.wins / a.picks : 0;
        bv = b.picks > 0 ? b.wins / b.picks : 0;
      } else if (sortKey === "kda") {
        av = kdaRatio(a.kills, a.deaths, a.assists);
        bv = kdaRatio(b.kills, b.deaths, b.assists);
      } else if (sortKey === "damage") {
        av = a.picks > 0 ? a.damage / a.picks : 0;
        bv = b.picks > 0 ? b.damage / b.picks : 0;
      } else {
        av = a.picks;
        bv = b.picks;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return result;
  }, [list, search, rarity, sortKey, sortDir, augmentData]);

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
        <table className="w-full min-w-[760px]">
          <thead className="bg-lol-dark/50">
            <tr>
              <SortHeader label="Augment" field="name" />
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider">
                Tier
              </th>
              <SortHeader label="Score" field="score" />
              <SortHeader label="Win Rate" field="winRate" className="w-36" />
              <SortHeader label="Picks" field="picks" />
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider whitespace-nowrap">
                Pick Rate
              </th>
              <SortHeader label="KDA" field="kda" />
              <SortHeader label="DMG" field="damage" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const expanded = expandedId === a.augment_id;
              return (
                <AugmentRow
                  key={a.augment_id}
                  aug={a}
                  tier={tiers.get(a.augment_id)!}
                  scoreValue={score(a.wins, a.picks)}
                  kda={kdaRatio(a.kills, a.deaths, a.assists)}
                  avgDamage={a.picks > 0 ? a.damage / a.picks : 0}
                  pickRate={totalSlots > 0 ? ((a.picks / totalSlots) * 100).toFixed(1) : "0.0"}
                  expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : a.augment_id)}
                  rows={rows}
                  filters={filters}
                  augmentData={augmentData}
                  championData={championData}
                  onSelectChampion={onSelectChampion}
                />
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">No augments found</div>
        )}
      </div>
      <p className="text-xs text-lol-text/70">
        Score is the win rate adjusted toward 50% for small samples; tiers rank each augment
        against others of its rarity. * fewer than 20 games — treat with caution.
      </p>
    </div>
  );
}

function AugmentRow({
  aug,
  tier,
  scoreValue,
  kda,
  avgDamage,
  pickRate,
  expanded,
  onToggle,
  rows,
  filters,
  augmentData,
  championData,
  onSelectChampion,
}: {
  aug: { augment_id: number; picks: number; wins: number };
  tier: Tier;
  scoreValue: number;
  kda: number;
  avgDamage: number;
  pickRate: string;
  expanded: boolean;
  onToggle: () => void;
  rows: AugmentStatRow[];
  filters: Filters;
  augmentData: AugmentData;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
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
        <td className="px-3 py-2">
          <TierBadge tier={tier} games={aug.picks} />
        </td>
        <td className="px-3 py-2 text-sm text-lol-text-bright font-medium">
          {scoreValue.toFixed(1)}
        </td>
        <td className="px-3 py-2 w-36">
          <WinRateBar wins={aug.wins} total={aug.picks} />
        </td>
        <td className="px-3 py-2 text-sm text-lol-text-bright">{aug.picks}</td>
        <td className="px-3 py-2 text-sm text-lol-text">{pickRate}%</td>
        <td className="px-3 py-2 text-sm text-lol-text-bright">{kda.toFixed(2)}</td>
        <td className="px-3 py-2 text-sm text-lol-text">{formatCompact(avgDamage)}</td>
      </tr>
      {expanded && (
        <tr className="border-t border-lol-border/30 bg-lol-dark/40">
          <td colSpan={8} className="px-4 py-3">
            <p className="text-xs text-lol-text uppercase tracking-wider mb-2">
              Best with ({getAugmentName(augmentData, aug.augment_id)})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {breakdown.map((c) => (
                <div key={c.champion_id} className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectChampion(c.champion_id);
                    }}
                    className="flex items-center gap-2 min-w-0 hover:text-lol-gold"
                  >
                    <ChampionIcon championId={c.champion_id} size={22} />
                    <span className="text-xs text-lol-text-bright w-24 truncate text-left hover:text-lol-gold">
                      {getChampionName(championData, c.champion_id)}
                    </span>
                  </button>
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
