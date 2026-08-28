import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStatsFilters } from "../hooks/useStatsFilters";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import type { ChampionStats } from "../lib/types";
import PatchRangeSelect from "../../shared/ui/PatchRangeSelect";
import { usePatchOptions } from "../hooks/usePatchOptions";
import { patchesIn, patchLabel, patchParam } from "../../shared/patch";
import SourceSwitch, { useStatsSource } from "../components/SourceSwitch";
import { assignTiers, score } from "../../shared/score";
import { useSort } from "../../shared/ui/SortHeader";
import SearchField from "../../shared/ui/SearchField";
import QueueSelect, { queueLabel } from "../components/QueueSelect";
import StatBoard, { SortControl, sortOptions, sortRows } from "../../shared/ui/StatBoard";
import { championColumns, type ChampionSortKey } from "../../shared/ui/boardColumns";

export default function Champions() {
  const champData = useChampionData();
  // Wide windows get larger icons; the icon components size in pixels
  const wide = useMediaQuery("(min-width: 1500px)");
  const { patchSelection, setPatchSelection, queue, setQueue } = useStatsFilters();
  const [source, setSource] = useStatsSource();
  const patchOptions = usePatchOptions(source);
  const patches = useMemo(
    () => patchesIn(patchSelection, patchOptions),
    [patchSelection, patchOptions],
  );
  const { data, error, refetch } = useIpc<ChampionStats[]>(
    () =>
      source === "community"
        ? window.api.getCommunityChampionStats(patches, queue)
        : window.api.getChampionStats(patches, queue),
    [patches, queue, source],
  );
  const [search, setSearch] = useState("");
  // Score-first, like the website: rank is the point of a tier list
  const { sort, toggle } = useSort<ChampionSortKey>("score");
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  // Clicking a champion opens the full page - tier, score, core build, best
  // augments per rarity - rather than a three-column strip inside the row.
  // The filters ride along so the page opens on what you were looking at.
  const openChampion = (championId: number) => {
    const params = new URLSearchParams();
    if (source === "community") params.set("source", "community");
    // Omitted means the current patch, so the champion page opens on the same
    // selection this board is showing
    const patchValue = patchParam(patchSelection, patchOptions);
    if (patchValue) params.set("patch", patchValue);
    params.set("queue", queue == null ? "all" : String(queue));
    navigate(`/champions/${championId}?${params}`);
  };

  // Tier is a rank within everything under the current filters, so it is
  // computed before the search narrows the list - searching for one champion
  // must not make it S+ by default.
  const tiers = useMemo(
    () =>
      data
        ? assignTiers(
            data,
            (c) => score(c.wins, c.games),
            (c) => c.champion_id,
          )
        : new Map(),
    [data],
  );
  // Champion slots under these filters; a champion's share of them is its
  // pick rate, the same denominator the website uses
  const totalSlots = useMemo(() => (data ? data.reduce((sum, c) => sum + c.games, 0) : 0), [data]);
  // Ten champion slots per game
  const totalGames = Math.round(totalSlots / 10);
  const label = patchLabel(patchSelection, patchOptions);

  const columns = useMemo(
    () =>
      championColumns({
        tiers,
        totalSlots,
        name: (id) => getChampionName(champData, id),
        iconSize: wide ? 36 : 28,
      }),
    [tiers, totalSlots, champData, wide],
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    const filtered = data.filter((c) =>
      getChampionName(champData, c.champion_id).toLowerCase().includes(q),
    );
    return sortRows(filtered, columns, sort);
  }, [data, columns, search, sort, champData]);

  // A rejected fetch used to leave "Loading..." on screen forever, which is
  // indistinguishable from a slow one. Say what happened and offer a retry.
  if (error) {
    return (
      <div className="text-center mt-20 space-y-3">
        <p className="text-lol-loss text-sm">Couldn't load champion stats: {error}</p>
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Named the same way the website names it: the queue, the list, then
            the slice the numbers cover - so a game count reads as the patches
            in view for this queue rather than the size of the whole database */}
        <div>
          <h1 className="text-xl font-bold text-lol-text-bright">
            {queueLabel(queue)} Champions Tier List
          </h1>
          <p className="text-xs text-lol-text mt-0.5">
            {label} · {totalGames.toLocaleString()} games
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <QueueSelect value={queue} onChange={setQueue} />
          <PatchRangeSelect
            patches={patchOptions}
            selection={patchSelection}
            onChange={setPatchSelection}
          />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search champion..."
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
        rowKey={(c) => c.champion_id}
        onRowClick={(c) => openChampion(c.champion_id)}
        sort={sort}
        onSort={toggle}
        empty={
          source === "community"
            ? "No champions in the community data for these filters"
            : "No champions found"
        }
      />
    </div>
  );
}
