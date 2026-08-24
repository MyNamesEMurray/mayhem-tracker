import { useEffect, useMemo, useState } from "react";
import { fetchAugmentChampions, type AugmentStatRow, type AugmentTotalRow } from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getAugmentName, getChampionName } from "../lib/dragon";
import {
  aggregateAugments,
  assignTiers,
  augmentChampionBreakdown,
  formatCompact,
  kdaRampClass,
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
import { championSlug } from "../lib/slug";

type SortKey = "score" | "picks" | "winRate" | "kda" | "damage" | "name";
type SortDir = "asc" | "desc";

export default function AugmentsTable({
  rows,
  filters,
  totalSlots,
  minGames = 0,
  confidentOnly = false,
  onToggleConfident,
  augmentData,
  championData,
  onSelectChampion,
}: {
  rows: AugmentTotalRow[];
  filters: Filters;
  totalSlots: number;
  minGames?: number;
  confidentOnly?: boolean;
  onToggleConfident?: () => void;
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
    // Tier assignment above still sees the full cohort — hiding low-sample
    // rows must not promote what remains
    let filtered = minGames > 0 ? list.filter((a) => a.picks >= minGames) : list;
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
  }, [list, search, rarity, sortKey, sortDir, augmentData, minGames]);

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
        <RarityFilter value={rarity} onChange={setRarity} />
        {onToggleConfident && (
          <button
            onClick={onToggleConfident}
            aria-pressed={confidentOnly}
            title="Hide results with fewer than 20 picks (the ones marked with *)"
            className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
              confidentOnly
                ? "bg-lol-gold/15 text-lol-gold border-lol-gold/50"
                : "text-lol-text border-lol-border bg-lol-card hover:border-lol-gold/40"
            }`}
          >
            20+ games
          </button>
        )}
        <span className="text-xs self-center ml-1">
          {sorted.length} augment{sorted.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search augment..."
            width={190}
          />
        </div>
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-x-auto">
        <table className="atbl table-fixed w-full min-w-[960px] border-collapse">
          <thead className="bg-lol-dark/50">
            <tr>
              <SortHeader label="Augment" field="name" />
              <th className={`${th} text-lol-text w-16`}>Tier</th>
              <SortHeader label="Score" field="score" className="w-[84px]" />
              <SortHeader label="Win rate" field="winRate" className="w-[150px]" />
              <SortHeader label="Picks" field="picks" className="w-[76px]" />
              <th className={`${th} text-lol-text w-[84px] whitespace-nowrap`}>Pick rate</th>
              <SortHeader label="KDA" field="kda" className="w-[76px]" />
              <SortHeader label="Damage" field="damage" className="w-[84px]" />
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
          <div className="py-8 text-center text-sm text-lol-text">
            {minGames > 0 && list.length > 0
              ? "No augments with 20+ picks under these filters — try a wider patch range or turn off the 20+ filter"
              : "No augments found"}
          </div>
        )}
      </div>
      <p className="text-xs text-lol-text/70">
        Score is the win rate adjusted toward 50% for small samples; tiers rank each augment against
        others of its rarity. * fewer than 20 games — treat with caution.
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
  filters: Filters;
  augmentData: AugmentData;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
}) {
  // The per-champion grain is fetched for this one augment when the row opens.
  // Holding all of it for every augment is 341k rows; one augment is ~2k.
  const [rows, setRows] = useState<AugmentStatRow[] | null>(null);
  useEffect(() => {
    if (!expanded || rows) return;
    let active = true;
    fetchAugmentChampions(aug.augment_id)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, [expanded, rows, aug.augment_id]);

  const breakdown = useMemo(
    () =>
      expanded && rows ? augmentChampionBreakdown(rows, filters, aug.augment_id).slice(0, 9) : [],
    [expanded, rows, filters, aug.augment_id],
  );

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
      >
        <td className="px-3 py-[9px]">
          <AugmentIcon augmentData={augmentData} augmentId={aug.augment_id} size={26} showName />
        </td>
        <td className="px-3 py-[9px]">
          <TierBadge tier={tier} games={aug.picks} />
        </td>
        <td className="px-3 py-[9px] text-[13px] font-semibold text-lol-text-bright">
          {scoreValue.toFixed(1)}
        </td>
        <td className="px-3 py-[9px]">
          <WinRateBar wins={aug.wins} total={aug.picks} />
        </td>
        <td className="px-3 py-[9px] text-[13px] text-lol-text-bright">{aug.picks}</td>
        <td className="px-3 py-[9px] text-[13px] text-lol-text">{pickRate}%</td>
        <td className={`px-3 py-[9px] text-[13px] font-semibold ${kdaRampClass(kda)}`}>
          {kda.toFixed(2)}
        </td>
        <td className="px-3 py-[9px] text-[13px] text-lol-text">{formatCompact(avgDamage)}</td>
      </tr>
      {expanded && (
        <tr className="xrow border-t border-lol-border/30 bg-lol-dark/40">
          <td colSpan={8} className="px-4 py-3">
            <p className="text-[11px] text-lol-text uppercase tracking-[.08em] mb-2">Best with</p>
            <div className="grid grid-cols-1 min-[681px]:grid-cols-2 min-[1101px]:grid-cols-3 gap-2">
              {breakdown.map((c) => (
                <div
                  key={c.champion_id}
                  className="flex items-center gap-2 bg-lol-dark/50 border border-lol-border/50 rounded-lg px-2.5 py-1.5"
                >
                  <a
                    href={`/champion/${championSlug(getChampionName(championData, c.champion_id))}/`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectChampion(c.champion_id);
                    }}
                    className="flex items-center gap-2 min-w-0 hover:text-lol-gold"
                  >
                    <ChampionIcon championId={c.champion_id} size={22} />
                    <span className="text-xs text-lol-text-bright w-[100px] truncate text-left hover:text-lol-gold">
                      {getChampionName(championData, c.champion_id)}
                    </span>
                  </a>
                  <span className="text-xs text-lol-text w-14 shrink-0">{c.picks} picks</span>
                  <div className="flex-1 min-w-16">
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
