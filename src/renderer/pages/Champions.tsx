import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStatsFilters } from "../hooks/useStatsFilters";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import type { ChampionStats } from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import WinRateBar from "../../shared/ui/WinRateBar";
import PatchSelect from "../components/PatchSelect";
import { useCommunityPatches } from "../hooks/useCommunityPatches";
import SourceSwitch, { useStatsSource } from "../components/SourceSwitch";
import TierBadge from "../../shared/ui/TierBadge";
import { assignTiers, score, TIER_ORDER } from "../../shared/score";
import SortHeader, { useSort } from "../components/SortHeader";
import QueueSelect from "../components/QueueSelect";
import { QUEUE_LABELS } from "../../shared/queues";
import { formatAvg, formatWhole, kdaRatio, kdaColor } from "../lib/format";

type SortKey =
  | "score"
  | "name"
  | "games"
  | "wins"
  | "avg_kills"
  | "avg_deaths"
  | "avg_assists"
  | "kda"
  | "avg_damage"
  | "avg_gold"
  | "tier"
  | "pickRate";

export default function Champions() {
  const champData = useChampionData();
  // Wide windows get larger icons; the icon components size in pixels
  const wide = useMediaQuery("(min-width: 1500px)");
  const { patch, setPatch, queue, setQueue } = useStatsFilters();
  const [source, setSource] = useStatsSource();
  const communityPatches = useCommunityPatches(source);
  const { data, error, refetch } = useIpc<ChampionStats[]>(
    () =>
      source === "community"
        ? window.api.getCommunityChampionStats(patch, queue)
        : window.api.getChampionStats(patch, queue),
    [patch, queue, source],
  );
  const [search, setSearch] = useState("");
  // Score-first, like the website: rank is the point of a tier list
  const { sort, toggle } = useSort<SortKey>("score");
  const { key: sortKey, dir: sortDir } = sort;
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  // Clicking a champion opens the full page — tier, score, core build, best
  // augments per rarity — rather than a three-column strip inside the row.
  // The filters ride along so the page opens on what you were looking at.
  const openChampion = (championId: number) => {
    const params = new URLSearchParams();
    if (source === "community") params.set("source", "community");
    params.set("patch", patch ?? "all");
    params.set("queue", queue == null ? "all" : String(queue));
    navigate(`/champions/${championId}?${params}`);
  };

  // Tier is a rank within everything under the current filters, so it is
  // computed before the search narrows the list — searching for one champion
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
  // The app's queue dropdown treats an empty selection as every queue, and
  // hides itself entirely while only one queue has data — in which case that
  // one queue is what's on screen
  const queueLabel = queue == null ? "All Queues" : (QUEUE_LABELS[queue] ?? `Queue ${queue}`);
  const patchLabel = patch ? `Patch ${patch}` : "All patches";

  const sorted = useMemo(() => {
    if (!data) return [];
    let filtered = data.filter((c) => {
      const name = getChampionName(champData, c.champion_id).toLowerCase();
      return name.includes(search.toLowerCase());
    });

    filtered.sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "tier") {
        // S+ first descending. A tier holds a big slice of the roster, so
        // score breaks the ties and the order inside a tier still means
        // something.
        const at = TIER_ORDER.indexOf(tiers.get(a.champion_id)!);
        const bt = TIER_ORDER.indexOf(tiers.get(b.champion_id)!);
        if (at !== bt) return sortDir === "desc" ? at - bt : bt - at;
        av = score(a.wins, a.games);
        bv = score(b.wins, b.games);
      } else if (sortKey === "pickRate") {
        // Games over a fixed slot total, so this is the games order
        av = a.games;
        bv = b.games;
      } else if (sortKey === "wins") {
        av = a.games > 0 ? a.wins / a.games : 0;
        bv = b.games > 0 ? b.wins / b.games : 0;
      } else if (sortKey === "score") {
        av = score(a.wins, a.games);
        bv = score(b.wins, b.games);
      } else if (sortKey === "name") {
        const an = getChampionName(champData, a.champion_id);
        const bn = getChampionName(champData, b.champion_id);
        return sortDir === "desc" ? bn.localeCompare(an) : an.localeCompare(bn);
      } else if (sortKey === "kda") {
        av = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : Infinity;
        bv = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : Infinity;
      } else {
        av = (a as any)[sortKey];
        bv = (b as any)[sortKey];
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, search, sortKey, sortDir, champData, tiers]);

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

  // This table carries twelve columns where the others carry five, so its
  // headers take the same wider gutter its cells now use rather than the
  // shared default — otherwise the header and the value under it don't line up
  const sortProps = {
    sort,
    onSort: toggle,
    thClass: "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] select-none",
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        {/* Named the same way the website names it: the queue, the list, then
            the slice the numbers cover — so a game count reads as this patch
            of this queue rather than the size of the whole database */}
        <div>
          <h1 className="text-xl font-bold text-lol-text-bright">
            {queueLabel} Champions Tier List
          </h1>
          <p className="text-xs text-lol-text mt-0.5">
            {patchLabel} · {totalGames.toLocaleString()} games
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QueueSelect value={queue} onChange={setQueue} />
          <PatchSelect value={patch} onChange={setPatch} options={communityPatches} />
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search champion..."
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
      </div>

      <SourceSwitch source={source} onChange={setSource} />

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-lol-dark/50">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em] w-12">
                #
              </th>
              <SortHeader label="Champion" field="name" naturalDir="asc" {...sortProps} />
              <SortHeader label="Tier" field="tier" className="w-16" {...sortProps} />
              <SortHeader label="Score" field="score" {...sortProps} />
              <SortHeader label="Win Rate" field="wins" {...sortProps} />
              <SortHeader label="Games" field="games" {...sortProps} />
              <SortHeader label="Pick Rate" field="pickRate" {...sortProps} />
              <SortHeader label="Kills" field="avg_kills" {...sortProps} />
              <SortHeader label="Deaths" field="avg_deaths" {...sortProps} />
              <SortHeader label="Assists" field="avg_assists" {...sortProps} />
              <SortHeader label="KDA" field="kda" {...sortProps} />
              <SortHeader label="Damage" field="avg_damage" {...sortProps} />
              <SortHeader label="Gold" field="avg_gold" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr
                key={c.champion_id}
                onClick={() => openChampion(c.champion_id)}
                className="border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
              >
                <td className="px-4 py-1.5 text-xs text-lol-text">{i + 1}</td>
                <td className="px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    <ChampionIcon championId={c.champion_id} size={wide ? 36 : 28} />
                    <span className="text-sm text-lol-text-bright">
                      {getChampionName(champData, c.champion_id)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-1.5">
                  {tiers.get(c.champion_id) && (
                    <TierBadge tier={tiers.get(c.champion_id)!} games={c.games} />
                  )}
                </td>
                <td className="px-4 py-1.5 text-sm font-semibold text-lol-text-bright">
                  {score(c.wins, c.games).toFixed(1)}
                </td>
                <td className="px-4 py-1.5 w-32 min-[1500px]:w-72">
                  <WinRateBar wins={c.wins} total={c.games} />
                </td>
                <td className="px-4 py-1.5 text-sm text-lol-text-bright">{formatWhole(c.games)}</td>
                <td className="px-4 py-1.5 text-sm text-lol-text">
                  {totalSlots > 0 ? ((c.games / totalSlots) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="px-4 py-1.5 text-sm text-lol-text">{formatAvg(c.avg_kills)}</td>
                <td className="px-4 py-1.5 text-sm text-lol-text">{formatAvg(c.avg_deaths)}</td>
                <td className="px-4 py-1.5 text-sm text-lol-text">{formatAvg(c.avg_assists)}</td>
                <td
                  className={`px-4 py-1.5 text-sm ${kdaColor(c.deaths > 0 ? (c.kills + c.assists) / c.deaths : Infinity)}`}
                >
                  {kdaRatio(c.kills, c.deaths, c.assists)}
                </td>
                <td className="px-4 py-1.5 text-sm text-lol-text">{formatWhole(c.avg_damage)}</td>
                <td className="px-4 py-1.5 text-sm text-lol-text-bright">
                  {formatWhole(c.avg_gold)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">
            {source === "community"
              ? "No champions in the community data for these filters"
              : "No champions found"}
          </div>
        )}
      </div>
    </div>
  );
}
