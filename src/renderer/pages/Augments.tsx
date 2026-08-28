import { useState, useMemo, useEffect } from "react";
import { useIpc } from "../hooks/useIpc";
import { useStatsFilters } from "../hooks/useStatsFilters";
import {
  useChampionData,
  getChampionName,
  useAugmentData,
  getAugmentName,
} from "../hooks/useChampions";
import type { AugmentStatsDetailed, ChampionStats } from "../lib/types";
import ChampionIcon from "../../shared/ui/ChampionIcon";
import WinRateBar from "../../shared/ui/WinRateBar";
import PatchRangeSelect from "../../shared/ui/PatchRangeSelect";
import QueueSelect, { queueLabel } from "../components/QueueSelect";
import RarityFilter, { type Rarity } from "../../shared/ui/RarityFilter";
import { useSort } from "../../shared/ui/SortHeader";
import SearchField from "../../shared/ui/SearchField";
import StatBoard, { SortControl, sortOptions, sortRows } from "../../shared/ui/StatBoard";
import AugmentPairs, { type AugmentPairRow } from "../../shared/ui/AugmentPairs";
import { augmentColumns, type AugmentSortKey } from "../../shared/ui/boardColumns";
import { assignTiers, score, type Tier } from "../../shared/score";
import { formatWhole } from "../lib/format";
import SourceSwitch, { useStatsSource } from "../components/SourceSwitch";
import { usePatchOptions } from "../hooks/usePatchOptions";
import { patchesIn, patchLabel } from "../../shared/patch";

export default function Augments() {
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const { patchSelection, setPatchSelection, queue, setQueue } = useStatsFilters();
  const [source, setSource] = useStatsSource();
  const patchOptions = usePatchOptions(source);
  const patches = useMemo(
    () => patchesIn(patchSelection, patchOptions),
    [patchSelection, patchOptions],
  );
  // The community pool has no per-augment champion breakdown up front - that
  // grain is 341k rows - so those rows arrive per augment, on expand.
  const { data, error, refetch } = useIpc<AugmentStatsDetailed[]>(
    () =>
      source === "community"
        ? window.api
            .getCommunityAugmentStats(patches, queue)
            .then((rows) => rows.map((r) => ({ ...r, champions: [] })))
        : window.api.getAugmentStatsDetailed(patches, queue),
    [patches, queue, source],
  );
  // The denominator for both the header count and pick rate. Deriving it from
  // augment picks (÷4, one per augment slot) looked right and wasn't: it
  // counts participant slots rather than games, and undercounts even those,
  // because a player who took three augments contributes three picks. Reading
  // the champion rows - exactly what the Champions tab sums - makes the two
  // tabs agree by construction instead of by coincidence.
  const { data: championRows } = useIpc<ChampionStats[]>(
    () =>
      source === "community"
        ? window.api.getCommunityChampionStats(patches, queue)
        : window.api.getChampionStats(patches, queue),
    [patches, queue, source],
  );

  const [search, setSearch] = useState("");
  const { sort, toggle } = useSort<AugmentSortKey>("score");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rarityFilter, setRarityFilter] = useState<Rarity>("all");

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  // Tiers rank each augment against its own rarity - Prismatics are strictly
  // stronger than Silvers, so one global ranking would just sort by rarity.
  // Assigned over the unfiltered list so searching never reshuffles a badge.
  const tiers = useMemo(() => {
    const all = new Map<number, Tier>();
    if (!data) return all;
    const byRarity = new Map<string, typeof data>();
    for (const a of data) {
      const r = augmentData[a.augment_id]?.rarity ?? "unknown";
      const group = byRarity.get(r) ?? [];
      group.push(a);
      byRarity.set(r, group);
    }
    for (const group of byRarity.values()) {
      for (const [id, tier] of assignTiers(
        group,
        (a) => score(a.wins, a.picks),
        (a) => a.augment_id,
      )) {
        all.set(id, tier);
      }
    }
    return all;
  }, [data, augmentData]);

  const label = patchLabel(patchSelection, patchOptions);

  // Ten champion slots per game
  const totalSlots = useMemo(
    () => (championRows ?? []).reduce((sum, c) => sum + c.games, 0),
    [championRows],
  );
  const totalGames = Math.round(totalSlots / 10);

  // Per-augment champion rows for the community source, keyed by augment
  const [communityChampions, setCommunityChampions] = useState<
    Record<number, { champion_id: number; picks: number; wins: number }[]>
  >({});
  // Which augments pair well with this one. Community only: a pairing needs
  // hundreds of games to mean anything and a personal history has tens.
  const [pairs, setPairs] = useState<Record<number, AugmentPairRow[]>>({});

  // A change of patch, queue or source invalidates anything already fetched
  useEffect(() => {
    setCommunityChampions({});
    setPairs({});
  }, [patches, queue, source]);

  // Every augment's own win rate under these filters, which is the bar a
  // pairing has to clear to be worth calling a synergy
  const soloRate = useMemo(() => {
    const byId = new Map((data ?? []).map((a) => [a.augment_id, a]));
    return (augmentId: number) => {
      const a = byId.get(augmentId);
      return a && a.picks > 0 ? (a.wins / a.picks) * 100 : null;
    };
  }, [data]);

  const toggleExpand = (augmentId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(augmentId)) next.delete(augmentId);
      else next.add(augmentId);
      return next;
    });
    if (source === "community" && communityChampions[augmentId] === undefined) {
      window.api
        .getCommunityAugmentChampions(augmentId, patches, queue)
        .then((rows) => setCommunityChampions((prev) => ({ ...prev, [augmentId]: rows })))
        .catch(() => setCommunityChampions((prev) => ({ ...prev, [augmentId]: [] })));
    }
    if (source === "community" && pairs[augmentId] === undefined) {
      window.api
        .getCommunityAugmentPairs(augmentId, patches, queue)
        .then((rows) => setPairs((prev) => ({ ...prev, [augmentId]: rows })))
        .catch(() => setPairs((prev) => ({ ...prev, [augmentId]: [] })));
    }
  };

  const columns = useMemo(
    () =>
      augmentColumns({
        tiers,
        totalSlots,
        name: (id) => getAugmentName(augmentData, id),
        expander: (a) => (
          <span
            className={`inline-block transition-transform ${
              expanded.has(a.augment_id) ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
        ),
      }),
    [tiers, totalSlots, augmentData, expanded],
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    const filtered = data.filter((a) => {
      if (!getAugmentName(augmentData, a.augment_id).toLowerCase().includes(q)) return false;
      if (rarityFilter !== "all" && augmentData[a.augment_id]?.rarity !== rarityFilter) {
        return false;
      }
      return true;
    });
    return sortRows(filtered, columns, sort);
  }, [data, columns, search, sort, augmentData, rarityFilter]);

  // A rejected fetch used to leave "Loading..." on screen forever, which is
  // indistinguishable from a slow one. Say what happened and offer a retry.
  if (error) {
    return (
      <div className="text-center mt-20 space-y-3">
        <p className="text-lol-loss text-sm">Couldn't load augment stats: {error}</p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1 text-xs font-medium rounded-lg border border-lol-border bg-lol-card text-lol-text hover:border-lol-gold/40 hover:text-lol-gold cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-xl font-bold text-lol-text-bright">
          {queueLabel(queue)} Augments Tier List
        </h1>
        <p className="text-xs text-lol-text mt-0.5">
          {label} · {totalGames.toLocaleString()} games
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <RarityFilter value={rarityFilter} onChange={setRarityFilter} />
        <span className="text-xs text-lol-text self-center ml-2">{sorted.length} augments</span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <QueueSelect value={queue} onChange={setQueue} />
          <PatchRangeSelect
            patches={patchOptions}
            selection={patchSelection}
            onChange={setPatchSelection}
          />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search augment..."
            width={192}
          />
        </div>
      </div>

      <SourceSwitch source={source} onChange={setSource} />

      {/* Only visible once the window is narrow enough to drop the header row */}
      <SortControl options={sortOptions(columns)} sort={sort} onSort={toggle} />

      <StatBoard
        columns={columns}
        rows={sorted}
        rowKey={(a) => a.augment_id}
        onRowClick={(a) => toggleExpand(a.augment_id)}
        sort={sort}
        onSort={toggle}
        minWidth={960}
        empty="No augments found"
        renderAfterRow={(a) =>
          expanded.has(a.augment_id) ? (
            <tr className="board-expansion border-t border-lol-border/30 bg-lol-dark/40">
              <td colSpan={columns.length} className="px-4 py-3 space-y-4">
                {source === "community" && (
                  <div>
                    <p className="text-[11px] text-lol-text uppercase tracking-[.08em] mb-2">
                      Pairs well with
                    </p>
                    <AugmentPairs
                      augmentId={a.augment_id}
                      rows={pairs[a.augment_id] ?? []}
                      soloRate={soloRate}
                    />
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-lol-text uppercase tracking-[.08em] mb-2">
                    Best with
                  </p>
                  <div className="grid grid-cols-1 min-[681px]:grid-cols-2 min-[1101px]:grid-cols-3 gap-2">
                    {(source === "community"
                      ? (communityChampions[a.augment_id] ?? [])
                      : a.champions
                    )
                      .slice(0, 9)
                      .map((c) => (
                        <div
                          key={c.champion_id}
                          className="flex items-center gap-2 bg-lol-dark/50 border border-lol-border/50 rounded-lg px-2.5 py-1.5"
                        >
                          <ChampionIcon championId={c.champion_id} size={22} />
                          <span className="text-xs text-lol-text-bright w-[100px] truncate">
                            {getChampionName(champData, c.champion_id)}
                          </span>
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
          ) : null
        }
      />
    </div>
  );
}
