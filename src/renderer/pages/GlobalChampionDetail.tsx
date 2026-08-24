import { useState, useMemo, useEffect, useCallback, type ReactNode } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useUrlStatsFilters } from "../hooks/useStatsFilters";
import {
  useChampionData,
  getChampionName,
  useAugmentData,
  getAugmentName,
  useItemData,
} from "../hooks/useChampions";
import type { GlobalChampionDetail, ItemStats, AugmentStats } from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import AugmentIcon from "../components/AugmentIcon";
import ItemIcon from "../components/ItemIcon";
import WinRateBar from "../components/WinRateBar";
import StatCard from "../components/StatCard";
import PatchSelect from "../components/PatchSelect";
import QueueSelect from "../components/QueueSelect";
import RarityFilter, { type Rarity } from "../components/RarityFilter";
import { kdaRatio, formatWhole } from "../lib/format";
import SortHeader, { useSort, type SortState } from "../components/SortHeader";

// buildRate/pickRate are picks over a fixed total, so they order identically
// to picks — they exist so no header in the table looks clickable and isn't.
type SortKey = "picks" | "winRate" | "name" | "rate";
type SortDir = "asc" | "desc";

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function MiniStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-lol-card rounded-lg border border-lol-border/60 px-3 py-2">
      <div className="text-[10px] text-lol-text uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold text-lol-text-bright">{children}</div>
    </div>
  );
}

// Doubles / triples / quadras / pentas in the same colors the other pages use
function MultikillCounts({
  doubles,
  triples,
  quadras,
  pentas,
}: {
  doubles: number;
  triples: number;
  quadras: number;
  pentas: number;
}) {
  const counts: { count: number; color: string }[] = [
    { count: doubles, color: "text-sky-400" },
    { count: triples, color: "text-amber-400" },
    { count: quadras, color: "text-purple-400" },
    { count: pentas, color: "text-red-400" },
  ];
  return (
    <div className="flex items-center gap-3">
      {counts.map(({ count, color }, i) => (
        <span key={i} className={count > 0 ? color : "text-lol-text/40"}>
          {count}
        </span>
      ))}
    </div>
  );
}



function sortRows<T extends { picks: number; wins: number }>(
  rows: T[],
  sort: SortState<SortKey>,
  nameOf: (row: T) => string,
): T[] {
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    if (key === "name") {
      const cmp = nameOf(a).localeCompare(nameOf(b));
      return dir === "asc" ? cmp : -cmp;
    }
    const value = (r: T) => (key === "winRate" ? (r.picks > 0 ? r.wins / r.picks : 0) : r.picks);
    return dir === "desc" ? value(b) - value(a) : value(a) - value(b);
  });
}

function ItemSection({
  items,
  games,
  patch,
}: {
  items: ItemStats[];
  games: number;
  patch?: string;
}) {
  const itemData = useItemData(patch);
  const { sort, toggle } = useSort<SortKey>("picks");
  const sorted = useMemo(
    () =>
      sortRows(items, sort, (i) => itemData[i.item_id]?.name ?? `Item ${i.item_id}`),
    [items, sort, itemData],
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-lol-text-bright uppercase tracking-wider">
          Items
        </h2>
        <span className="text-xs text-lol-text">{items.length} items</span>
      </div>
      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-lol-dark/50">
            <tr>
              <SortHeader label="Item" field="name" naturalDir="asc" sort={sort} onSort={toggle} />
              <SortHeader label="Picks" field="picks" sort={sort} onSort={toggle} />
              <SortHeader label="Build Rate" field="rate" sort={sort} onSort={toggle} />
              <SortHeader label="Win Rate" field="winRate" className="w-28" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.item_id} className="border-t border-lol-border/50">
                <td className="px-2 py-1.5 max-w-0 w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <ItemIcon itemId={item.item_id} size={24} patch={patch} />
                    <span className="text-xs text-lol-text-bright truncate">
                      {itemData[item.item_id]?.name ?? `Item ${item.item_id}`}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-xs text-lol-text-bright">{item.picks}</td>
                <td className="px-2 py-1.5 text-xs text-lol-text">
                  {games > 0 ? percent(item.picks / games) : "0.0%"}
                </td>
                <td className="px-2 py-1.5 w-28">
                  <WinRateBar wins={item.wins} total={item.picks} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">No items recorded</div>
        )}
      </div>
    </section>
  );
}

function AugmentSection({ augments, games }: { augments: AugmentStats[]; games: number }) {
  const augmentData = useAugmentData();
  const { sort, toggle } = useSort<SortKey>("picks");
  const [rarity, setRarity] = useState<Rarity>("all");

  const sorted = useMemo(() => {
    const filtered = augments.filter(
      (a) => rarity === "all" || augmentData[a.augment_id]?.rarity === rarity,
    );
    return sortRows(filtered, sort, (a) => getAugmentName(augmentData, a.augment_id));
  }, [augments, sort, augmentData, rarity]);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-lol-text-bright uppercase tracking-wider mr-2">
          Augments
        </h2>
        <RarityFilter value={rarity} onChange={setRarity} />
        <span className="text-xs text-lol-text ml-auto">{sorted.length} augments</span>
      </div>
      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-lol-dark/50">
            <tr>
              <SortHeader label="Augment" field="name" naturalDir="asc" sort={sort} onSort={toggle} />
              <SortHeader label="Picks" field="picks" sort={sort} onSort={toggle} />
              <SortHeader label="Pick Rate" field="rate" sort={sort} onSort={toggle} />
              <SortHeader label="Win Rate" field="winRate" className="w-28" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.augment_id} className="border-t border-lol-border/50">
                <td className="px-2 py-1.5 max-w-0 w-full">
                  <AugmentIcon augmentId={a.augment_id} size={24} showName />
                </td>
                <td className="px-2 py-1.5 text-xs text-lol-text-bright">{a.picks}</td>
                <td className="px-2 py-1.5 text-xs text-lol-text">
                  {games > 0 ? percent(a.picks / games) : "0.0%"}
                </td>
                <td className="px-2 py-1.5 w-28">
                  <WinRateBar wins={a.wins} total={a.picks} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">No augments recorded</div>
        )}
      </div>
    </section>
  );
}

export default function GlobalChampionDetailPage() {
  const { championId = "" } = useParams();
  const id = Number(championId);
  const champData = useChampionData();
  // Filters live in the URL so the back link returns to the same view
  const [searchParams] = useSearchParams();
  const { patch, setPatch, queue, setQueue } = useUrlStatsFilters();

  const { data, refetch } = useIpc<GlobalChampionDetail>(
    () => window.api.getGlobalChampionDetail(id, patch, queue),
    [id, patch, queue],
  );

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const backQuery = searchParams.toString();
  const backLink = (
    <Link
      to={`/global${backQuery ? `?${backQuery}` : ""}`}
      className="inline-flex items-center gap-1.5 text-xs text-lol-text hover:text-lol-text-bright transition-colors"
    >
      <span aria-hidden>←</span> Global Stats
    </Link>
  );

  if (!data) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  const losses = data.games - data.wins;
  const winRate = data.games > 0 ? data.wins / data.games : 0;
  const pickRate = data.totalParticipantSlots > 0 ? data.games / data.totalParticipantSlots : 0;
  const avg = (total: number) => (data.games > 0 ? (total / data.games).toFixed(1) : "0.0");

  return (
    <div className="w-full space-y-4">
      {backLink}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChampionIcon championId={id} size={48} />
          <div>
            <h1 className="text-xl font-bold text-lol-text-bright">
              {getChampionName(champData, id)}
            </h1>
            <span className="text-sm text-lol-text">
              {data.games} games played across all stored matches
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <QueueSelect value={queue} onChange={setQueue} />
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
      </div>

      {data.games === 0 ? (
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-lol-text">
          No games with this champion for the selected filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Win Rate"
              value={percent(winRate)}
              valueClassName={
                data.games < 20
                  ? "text-lol-text"
                  : winRate >= 0.5
                    ? "text-lol-win"
                    : "text-lol-loss"
              }
              subtext={`${data.wins}W ${losses}L`}
            />
            <StatCard
              label="KDA"
              value={`${avg(data.kills)} / ${avg(data.deaths)} / ${avg(data.assists)}`}
              subtext={`${kdaRatio(data.kills, data.deaths, data.assists)} ratio · ${data.kills} / ${data.deaths} / ${data.assists} total`}
            />
            <StatCard
              label="Damage"
              value={formatWhole(data.avgDamage)}
              subtext={`${percent(data.damageShare)} of team damage`}
            />
            <StatCard
              label="Pick Rate"
              value={percent(pickRate)}
              subtext={`${data.games} of ${data.totalParticipantSlots} picks`}
            />
          </div>

          <div className="grid grid-cols-5 gap-2">
            <MiniStat label="Kill Participation">{percent(data.killParticipation)}</MiniStat>
            <MiniStat label="Avg Gold">{formatWhole(data.avgGold)}</MiniStat>
            <MiniStat label="Avg Damage Taken">{formatWhole(data.avgDamageTaken)}</MiniStat>
            <MiniStat label="Avg Healing">{formatWhole(data.avgHeal)}</MiniStat>
            <MiniStat label="Multikills">
              <MultikillCounts
                doubles={data.doubleKills}
                triples={data.tripleKills}
                quadras={data.quadraKills}
                pentas={data.pentaKills}
              />
            </MiniStat>
          </div>

          <div className="grid grid-cols-2 gap-4 items-start">
            <ItemSection items={data.items} games={data.games} patch={patch} />
            <AugmentSection augments={data.augments} games={data.games} />
          </div>
        </>
      )}
    </div>
  );
}
