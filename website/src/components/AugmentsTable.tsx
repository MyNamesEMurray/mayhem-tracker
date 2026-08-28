import { useEffect, useMemo, useState } from "react";
import {
  fetchAugmentChampions,
  fetchAugmentPairs,
  type AugmentPairRow,
  type AugmentStatRow,
  type AugmentTotalRow,
} from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getAugmentName, getChampionName } from "../lib/dragon";
import {
  aggregateAugments,
  assignTiers,
  augmentChampionBreakdown,
  formatWhole,
  rowMatches,
  score,
  type Filters,
  type Tier,
} from "../lib/stats";
import ChampionIcon from "../../../src/shared/ui/ChampionIcon.tsx";
import RarityFilter, { type Rarity } from "../../../src/shared/ui/RarityFilter.tsx";
import SearchField from "../../../src/shared/ui/SearchField.tsx";
import WinRateBar from "../../../src/shared/ui/WinRateBar.tsx";
import AugmentPairs from "../../../src/shared/ui/AugmentPairs.tsx";
import { championSlug } from "../lib/slug";
import { useSort } from "../../../src/shared/ui/SortHeader.tsx";
import StatBoard, {
  SortControl,
  sortOptions,
  sortRows,
} from "../../../src/shared/ui/StatBoard.tsx";
import { augmentColumns, type AugmentSortKey } from "../../../src/shared/ui/boardColumns.tsx";

export default function AugmentsTable({
  rows,
  filters,
  totalSlots,
  augmentData,
  championData,
  onSelectChampion,
}: {
  rows: AugmentTotalRow[];
  filters: Filters;
  totalSlots: number;
  augmentData: AugmentData;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<Rarity>("all");
  const { sort, toggle } = useSort<AugmentSortKey>("score");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Tiers rank each augment against its own rarity - Prismatics are strictly
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

  const columns = useMemo(
    () =>
      augmentColumns({
        tiers,
        totalSlots,
        name: (id) => getAugmentName(augmentData, id),
      }),
    [tiers, totalSlots, augmentData],
  );

  // Every augment's own win rate under the current filters, which is what a
  // pairing has to beat to be worth calling a synergy. Already aggregated for
  // the table above.
  const soloRate = useMemo(() => {
    const byId = new Map(list.map((a) => [a.augment_id, a]));
    return (augmentId: number) => {
      const a = byId.get(augmentId);
      return a && a.picks > 0 ? (a.wins / a.picks) * 100 : null;
    };
  }, [list]);

  const sorted = useMemo(() => {
    // Tier assignment above still sees the full cohort - hiding low-sample
    // rows must not promote what remains
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
    return sortRows(filtered, columns, sort);
  }, [list, columns, search, rarity, sort, augmentData]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <RarityFilter value={rarity} onChange={setRarity} />
        <span className="text-xs self-center ml-1">
          {sorted.length} augment{sorted.length === 1 ? "" : "s"}
        </span>
        <SortControl options={sortOptions(columns)} sort={sort} onSort={toggle} />
        <div className="ml-auto">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search augment..."
            width={192}
          />
        </div>
      </div>

      <StatBoard
        columns={columns}
        rows={sorted}
        rowKey={(a) => a.augment_id}
        onRowClick={(a) => setExpandedId(expandedId === a.augment_id ? null : a.augment_id)}
        sort={sort}
        onSort={toggle}
        minWidth={960}
        empty="No augments found"
        renderAfterRow={(a) =>
          expandedId === a.augment_id ? (
            <AugmentExpansion
              augmentId={a.augment_id}
              colSpan={columns.length}
              filters={filters}
              championData={championData}
              onSelectChampion={onSelectChampion}
              soloRate={soloRate}
            />
          ) : null
        }
        footnote={
          <>
            Score is the win rate the record supports, out of 100 - the floor of a 95% confidence
            interval, so a thin sample scores well below the rate it happened to produce. Tiers rank
            each augment against others of its rarity. * fewer than 20 games - treat with caution.
          </>
        }
      />
    </div>
  );
}

function AugmentExpansion({
  augmentId,
  colSpan,
  filters,
  championData,
  onSelectChampion,
  soloRate,
}: {
  augmentId: number;
  colSpan: number;
  filters: Filters;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
  soloRate: (augmentId: number) => number | null;
}) {
  // The per-champion grain is fetched for this one augment when the row opens.
  // Holding all of it for every augment is 341k rows; one augment is ~2k.
  const [rows, setRows] = useState<AugmentStatRow[] | null>(null);
  const [pairs, setPairs] = useState<AugmentPairRow[]>([]);
  useEffect(() => {
    let active = true;
    fetchAugmentChampions(augmentId)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    fetchAugmentPairs(augmentId).then((r) => {
      if (active) setPairs(r);
    });
    return () => {
      active = false;
    };
  }, [augmentId]);

  const breakdown = useMemo(
    () => (rows ? augmentChampionBreakdown(rows, filters, augmentId).slice(0, 9) : []),
    [rows, filters, augmentId],
  );

  // Pairs come back per patch and queue, and answer to the same filters the
  // rest of the page does
  const visiblePairs = useMemo(() => pairs.filter((r) => rowMatches(r, filters)), [pairs, filters]);

  return (
    <tr className="board-expansion border-t border-lol-border/30 bg-lol-dark/40">
      <td colSpan={colSpan} className="px-4 py-3 space-y-4">
        <div>
          <p className="text-[11px] text-lol-text uppercase tracking-[.08em] mb-2">
            Pairs well with
          </p>
          <AugmentPairs augmentId={augmentId} rows={visiblePairs} soloRate={soloRate} />
        </div>
        <div>
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
                <span className="text-xs text-lol-text w-14 shrink-0">
                  {formatWhole(c.picks)} picks
                </span>
                <div className="flex-1 min-w-16">
                  <WinRateBar wins={c.wins} total={c.picks} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}
