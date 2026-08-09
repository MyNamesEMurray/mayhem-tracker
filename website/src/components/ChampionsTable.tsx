import { useMemo, useState } from "react";
import type { AugmentStatRow, ChampionStatRow } from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getChampionName } from "../lib/dragon";
import {
  aggregateChampions,
  assignTiers,
  championAugmentBreakdown,
  formatCompact,
  kdaRatio,
  score,
  type Filters,
} from "../lib/stats";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import SearchInput from "./SearchInput";
import TierBadge from "./TierBadge";
import WinRateBar from "./WinRateBar";

type SortKey = "score" | "games" | "winRate" | "kda" | "damage" | "name";
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
  }, [list, search, sortKey, sortDir, championData]);

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
        <table className="w-full min-w-[760px]">
          <thead className="bg-lol-dark/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider w-10">
                #
              </th>
              <SortHeader label="Champion" field="name" />
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider">
                Tier
              </th>
              <SortHeader label="Score" field="score" />
              <SortHeader label="Win Rate" field="winRate" className="w-36" />
              <SortHeader label="Games" field="games" />
              <SortHeader label="KDA" field="kda" />
              <SortHeader label="DMG" field="damage" />
              <th className="px-3 py-2 text-left text-xs font-medium text-lol-text uppercase tracking-wider">
                Pentas
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const expanded = expandedId === c.champion_id;
              const games = c.games;
              const avgK = games > 0 ? c.kills / games : 0;
              const avgD = games > 0 ? c.deaths / games : 0;
              const avgA = games > 0 ? c.assists / games : 0;
              return (
                <ChampionRow
                  key={c.champion_id}
                  index={i}
                  champ={c}
                  tier={tiers.get(c.champion_id)!}
                  scoreValue={score(c.wins, c.games)}
                  kda={kdaRatio(c.kills, c.deaths, c.assists)}
                  avgLine={`${avgK.toFixed(1)} / ${avgD.toFixed(1)} / ${avgA.toFixed(1)}`}
                  avgDamage={games > 0 ? c.damage / games : 0}
                  pickRate={totalSlots > 0 ? ((c.games / totalSlots) * 100).toFixed(1) : "0.0"}
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
      <p className="text-xs text-lol-text/70">
        Score is the win rate adjusted toward 50% for small samples; tiers rank Score across the
        current filter. * fewer than 20 games — treat with caution.
      </p>
    </div>
  );
}

function ChampionRow({
  index,
  champ,
  tier,
  scoreValue,
  kda,
  avgLine,
  avgDamage,
  pickRate,
  expanded,
  onToggle,
  augmentRows,
  filters,
  championData,
  augmentData,
}: {
  index: number;
  champ: { champion_id: number; games: number; wins: number; pentas: number };
  tier: import("../lib/stats").Tier;
  scoreValue: number;
  kda: number;
  avgLine: string;
  avgDamage: number;
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
            <span className="text-sm text-lol-text-bright group-hover:text-lol-gold transition-colors whitespace-nowrap">
              {getChampionName(championData, champ.champion_id)}
            </span>
          </div>
        </td>
        <td className="px-3 py-2">
          <TierBadge tier={tier} games={champ.games} />
        </td>
        <td className="px-3 py-2 text-sm text-lol-text-bright font-medium">
          {scoreValue.toFixed(1)}
        </td>
        <td className="px-3 py-2 w-36">
          <WinRateBar wins={champ.wins} total={champ.games} />
        </td>
        <td className="px-3 py-2 text-sm text-lol-text" title={`${pickRate}% of participant slots`}>
          {champ.games}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="text-sm text-lol-text-bright">{kda.toFixed(2)}</span>{" "}
          <span className="text-xs text-lol-text">{avgLine}</span>
        </td>
        <td className="px-3 py-2 text-sm text-lol-text">{formatCompact(avgDamage)}</td>
        <td className="px-3 py-2 text-sm">
          {champ.pentas > 0 ? (
            <span className="text-lol-gold">{champ.pentas}</span>
          ) : (
            <span className="text-lol-text/40">–</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-lol-border/30 bg-lol-dark/40">
          <td colSpan={9} className="px-4 py-3">
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
