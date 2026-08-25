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
import AugmentIcon from "../../shared/ui/AugmentIcon";
import ChampionIcon from "../../shared/ui/ChampionIcon";
import WinRateBar from "../../shared/ui/WinRateBar";
import PatchSelect from "../components/PatchSelect";
import QueueSelect from "../components/QueueSelect";
import { QUEUE_LABELS } from "../../shared/queues";
import RarityFilter, { type Rarity } from "../../shared/ui/RarityFilter";
import SortHeader, { useSort } from "../../shared/ui/SortHeader";
import SearchField from "../../shared/ui/SearchField";
import TierBadge from "../../shared/ui/TierBadge";
import { assignTiers, score, TIER_ORDER } from "../../shared/score";
import { formatWhole, kdaColor, kdaRatio } from "../lib/format";
import SourceSwitch, { useStatsSource } from "../components/SourceSwitch";
import { useCommunityPatches } from "../hooks/useCommunityPatches";

type SortKey = "picks" | "winRate" | "name" | "pickRate" | "score" | "tier" | "kda" | "damage";

export default function Augments() {
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const { patch, setPatch, queue, setQueue } = useStatsFilters();
  const [source, setSource] = useStatsSource();
  const communityPatches = useCommunityPatches(source);
  // The community pool has no per-augment champion breakdown up front — that
  // grain is 341k rows — so those rows arrive per augment, on expand.
  const { data, error, refetch } = useIpc<AugmentStatsDetailed[]>(
    () =>
      source === "community"
        ? window.api
            .getCommunityAugmentStats(patch, queue)
            .then((rows) => rows.map((r) => ({ ...r, champions: [] })))
        : window.api.getAugmentStatsDetailed(patch, queue),
    [patch, queue, source],
  );
  // The denominator for both the header count and pick rate. Deriving it from
  // augment picks (÷4, one per augment slot) looked right and wasn't: it
  // counts participant slots rather than games, and undercounts even those,
  // because a player who took three augments contributes three picks. Reading
  // the champion rows — exactly what the Champions tab sums — makes the two
  // tabs agree by construction instead of by coincidence.
  const { data: championRows } = useIpc<ChampionStats[]>(
    () =>
      source === "community"
        ? window.api.getCommunityChampionStats(patch, queue)
        : window.api.getChampionStats(patch, queue),
    [patch, queue, source],
  );

  const [search, setSearch] = useState("");
  const { sort, toggle } = useSort<SortKey>("score");
  const { key: sortKey, dir: sortDir } = sort;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rarityFilter, setRarityFilter] = useState<Rarity>("all");

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  // Tiers rank each augment against its own rarity — Prismatics are strictly
  // stronger than Silvers, so one global ranking would just sort by rarity.
  // Assigned over the unfiltered list so searching never reshuffles a badge.
  const tiers = useMemo(() => {
    if (!data)
      return new Map<
        number,
        ReturnType<typeof assignTiers> extends Map<number, infer T> ? T : never
      >();
    const byRarity = new Map<string, typeof data>();
    for (const a of data) {
      const r = augmentData[a.augment_id]?.rarity ?? "unknown";
      const group = byRarity.get(r) ?? [];
      group.push(a);
      byRarity.set(r, group);
    }
    const all = new Map<
      number,
      ReturnType<typeof assignTiers> extends Map<number, infer T> ? T : never
    >();
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

  // The app's queue dropdown treats an empty selection as every queue, and
  // hides itself entirely while only one queue has data — in which case that
  // one queue is what's on screen
  const queueLabel = queue == null ? "All Queues" : (QUEUE_LABELS[queue] ?? `Queue ${queue}`);
  const patchLabel = patch ? `Patch ${patch}` : "All patches";

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

  // A change of patch, queue or source invalidates anything already fetched
  useEffect(() => {
    setCommunityChampions({});
  }, [patch, queue, source]);

  const toggleExpand = (augmentId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(augmentId)) next.delete(augmentId);
      else next.add(augmentId);
      return next;
    });
    if (source === "community" && communityChampions[augmentId] === undefined) {
      window.api
        .getCommunityAugmentChampions(augmentId, patch, queue)
        .then((rows) => setCommunityChampions((prev) => ({ ...prev, [augmentId]: rows })))
        .catch(() => setCommunityChampions((prev) => ({ ...prev, [augmentId]: [] })));
    }
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
      } else if (sortKey === "score") {
        av = score(a.wins, a.picks);
        bv = score(b.wins, b.picks);
      } else if (sortKey === "tier") {
        const at = TIER_ORDER.indexOf(tiers.get(a.augment_id)!);
        const bt = TIER_ORDER.indexOf(tiers.get(b.augment_id)!);
        if (at !== bt) return sortDir === "desc" ? at - bt : bt - at;
        av = score(a.wins, a.picks);
        bv = score(b.wins, b.picks);
      } else if (sortKey === "kda") {
        av = (a.kills + a.assists) / Math.max(a.deaths, 1);
        bv = (b.kills + b.assists) / Math.max(b.deaths, 1);
      } else if (sortKey === "damage") {
        av = a.picks > 0 ? a.damage / a.picks : 0;
        bv = b.picks > 0 ? b.damage / b.picks : 0;
      } else if (sortKey === "pickRate") {
        // Picks over a fixed total, so this is the picks order
        av = a.picks;
        bv = b.picks;
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
  }, [data, tiers, search, sortKey, sortDir, augmentData, rarityFilter]);

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

  const sortProps = { sort, onSort: toggle };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-lol-text-bright">
            {queueLabel} Augments Tier List
          </h1>
          <p className="text-xs text-lol-text mt-0.5">
            {patchLabel} · {totalGames.toLocaleString()} games
          </p>
        </div>
      </div>

      {/* Rarity Filter + Search */}
      <div className="flex items-center gap-2">
        <RarityFilter value={rarityFilter} onChange={setRarityFilter} />
        <span className="text-xs text-lol-text self-center ml-2">{sorted.length} augments</span>
        <div className="ml-auto flex items-center gap-2">
          <QueueSelect value={queue} onChange={setQueue} />
          <PatchSelect value={patch} onChange={setPatch} options={communityPatches} />
        </div>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search augment..."
          width={192}
        />
      </div>

      <SourceSwitch source={source} onChange={setSource} />

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-lol-dark/50">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em] w-8"></th>
              <SortHeader label="Augment" field="name" naturalDir="asc" {...sortProps} />
              <SortHeader label="Tier" field="tier" className="w-16" {...sortProps} />
              <SortHeader label="Score" field="score" {...sortProps} />
              <SortHeader label="Win Rate" field="winRate" className="w-32" {...sortProps} />
              <SortHeader label="Picks" field="picks" {...sortProps} />
              <SortHeader label="Pick Rate" field="pickRate" {...sortProps} />
              <SortHeader label="KDA" field="kda" {...sortProps} />
              <SortHeader label="Damage" field="damage" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const isExpanded = expanded.has(a.augment_id);
              const pickRate = totalSlots > 0 ? ((a.picks / totalSlots) * 100).toFixed(1) : "0.0";
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
                    <td className="px-3 py-1.5">
                      {tiers.get(a.augment_id) && (
                        <TierBadge tier={tiers.get(a.augment_id)!} games={a.picks} />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-sm font-semibold text-lol-text-bright">
                      {score(a.wins, a.picks).toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 w-32 min-[1500px]:w-72">
                      <WinRateBar wins={a.wins} total={a.picks} />
                    </td>
                    <td className="px-3 py-1.5 text-sm text-lol-text-bright">
                      {formatWhole(a.picks)}
                    </td>
                    <td className="px-3 py-1.5 text-sm text-lol-text">{pickRate}%</td>
                    <td
                      className={`px-3 py-1.5 text-sm ${kdaColor(
                        (a.kills + a.assists) / Math.max(a.deaths, 1),
                      )}`}
                    >
                      {kdaRatio(a.kills, a.deaths, a.assists)}
                    </td>
                    <td className="px-3 py-1.5 text-sm text-lol-text">
                      {formatWhole(a.picks > 0 ? a.damage / a.picks : 0)}
                    </td>
                  </tr>
                  {isExpanded &&
                    (source === "community"
                      ? (communityChampions[a.augment_id] ?? []).slice(0, 12)
                      : a.champions
                    ).map((c) => (
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
                        <td></td>
                        <td className="px-3 py-1.5 text-sm text-lol-text">
                          {score(c.wins, c.picks).toFixed(1)}
                        </td>
                        <td className="px-3 py-1.5 w-32 min-[1500px]:w-72">
                          <WinRateBar wins={c.wins} total={c.picks} />
                        </td>
                        <td className="px-3 py-1.5 text-xs text-lol-text">
                          {formatWhole(c.picks)}
                        </td>
                        {/* Pick rate, KDA and damage aren't broken out per
                            champion — the columns stay empty rather than
                            repeating the augment's own numbers */}
                        <td></td>
                        <td></td>
                        <td></td>
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
