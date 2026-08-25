import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useMatches } from "../hooks/useMatches";
import { useStatsFilters } from "../hooks/useStatsFilters";
import { useOnWindowFocus } from "../hooks/useOnWindowFocus";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { useBackfill } from "../hooks/useBackfill";
import type {
  MatchListItem,
  MatchDetail,
  DashboardData,
  MatchFilterOptions,
  MatchSort,
  MatchSortDir,
  MultikillType,
  LcuStatus,
  BackfillProgress,
} from "../lib/types";
import ChampionIcon from "../../shared/ui/ChampionIcon";
import AugmentIcon from "../../shared/ui/AugmentIcon";
import ItemIcon from "../components/ItemIcon";
import MatchScoreboard from "../components/MatchScoreboard";
import MultikillBadge from "../components/MultikillBadge";
import StatBars from "../components/StatBars";
import StatCard from "../components/StatCard";
import { ArrowDownIcon } from "../../shared/ui/icons";
import {
  formatDuration,
  formatDateTime,
  formatKDA,
  kdaRatio,
  kdaStringColor,
  formatPatch,
  scoreRampColor,
} from "../lib/format";
import { queueLabel } from "../components/QueueSelect";

// An empty list means something different depending on whether we're still
// waiting on the client, mid-import, or genuinely out of games.
function emptyStateMessage(
  status: LcuStatus,
  backfill: { running: boolean; progress: BackfillProgress | null },
) {
  if (backfill.running) {
    const p = backfill.progress;
    return p && p.total > 0
      ? `Importing your match history — ${p.current} of ${p.total} games checked...`
      : "Importing your match history...";
  }
  if (status !== "connected") {
    return "Waiting for the League client. Once it's open, your Mayhem games import automatically.";
  }
  return "No ARAM Mayhem games found yet. New games are recorded as you play.";
}

// The unselected state is the default sort (date), so it isn't listed here
const SORT_OPTIONS: { value: MatchSort; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "kda", label: "KDA" },
  { value: "kills", label: "Kills" },
  { value: "duration", label: "Duration" },
];

// Widths are fixed per dropdown so changing a filter never reflows the row
const SELECT_CLASS = "select";
const SELECT_WIDE = "select select-lg";
const SELECT_SMALL = "select select-sm";

export default function MatchHistory() {
  const [championFilter, setChampionFilter] = useState<number | undefined>(undefined);
  const {
    patch: patchFilter,
    setPatch: setPatchFilter,
    queue: queueFilter,
    setQueue: setQueueFilter,
  } = useStatsFilters();
  const [multikillFilter, setMultikillFilter] = useState<MultikillType[]>([]);
  const [sort, setSort] = useState<MatchSort | undefined>(undefined);
  const [sortDir, setSortDir] = useState<MatchSortDir>("desc");
  const { matches, loading, hasMore, loadMore, reload } = useMatches({
    championId: championFilter,
    patch: patchFilter,
    queue: queueFilter,
    sort,
    sortDir,
    multikills: multikillFilter,
  });

  const toggleMultikill = useCallback((kind: MultikillType) => {
    setMultikillFilter((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }, []);
  const champData = useChampionData();
  const { data: dashboard, refetch: refetchDashboard } = useIpc<DashboardData>(
    () =>
      window.api.getDashboard({
        championId: championFilter,
        patch: patchFilter,
        queue: queueFilter,
      }),
    [championFilter, patchFilter, queueFilter],
  );
  const [filterOptions, setFilterOptions] = useState<MatchFilterOptions>({
    patches: [],
    champions: [],
    queues: [],
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    match: MatchListItem;
  } | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lcuStatus = useLcuStatus();
  const backfill = useBackfill();
  // One listener for the page rather than one per row
  const wide = useMediaQuery("(min-width: 1500px)");
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    const fetchOptions = () =>
      window.api
        .getMatchFilterOptions({
          championId: championFilter,
          patch: patchFilter,
          queue: queueFilter,
        })
        .then(setFilterOptions);
    fetchOptions();

    const unsub = window.api.onGamesUpdated(() => {
      refetchDashboard();
      fetchOptions();
      reload();
    });
    return unsub;
  }, [championFilter, patchFilter, queueFilter, refetchDashboard, reload]);

  // Catch up on anything recorded while the app sat in the tray
  useOnWindowFocus(() => {
    reload();
    refetchDashboard();
  });

  // Clear a selection if new data leaves it without any matching games
  useEffect(() => {
    if (filterOptions.champions.length === 0 && filterOptions.patches.length === 0) return;
    if (championFilter !== undefined && !filterOptions.champions.includes(championFilter)) {
      setChampionFilter(undefined);
    }
    if (patchFilter !== undefined && !filterOptions.patches.includes(patchFilter)) {
      setPatchFilter(undefined);
    }
    if (queueFilter !== undefined && !filterOptions.queues.includes(queueFilter)) {
      setQueueFilter(undefined);
    }
  }, [filterOptions]);

  const championOptions = useMemo(
    () =>
      filterOptions.champions
        .map((id) => ({ id, name: getChampionName(champData, id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filterOptions.champions, champData],
  );

  const toggleExpand = useCallback(
    async (gameId: number) => {
      if (expandedId === gameId) {
        setExpandedId(null);
        setDetail(null);
        return;
      }
      setExpandedId(gameId);
      setDetailLoading(true);
      try {
        const d = await window.api.getMatchDetail(gameId);
        setDetail(d);
      } finally {
        setDetailLoading(false);
      }
    },
    [expandedId],
  );

  // Overview's recent-match rows deep-link here with ?game=<id> so the row
  // opens expanded (newest games are always in the first page).
  useEffect(() => {
    const g = searchParams.get("game");
    if (!g) return;
    toggleExpand(Number(g));
    setSearchParams({}, { replace: true });
    // Run only for the value present on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleFavorite = useCallback(
    async (match: MatchListItem) => {
      setContextMenu(null);
      await window.api.toggleFavorite(match.game_id);
      reload();
    },
    [reload],
  );

  const avgKills =
    dashboard && dashboard.totalGames > 0
      ? (dashboard.totalKills / dashboard.totalGames).toFixed(1)
      : "0";
  const avgDeaths =
    dashboard && dashboard.totalGames > 0
      ? (dashboard.totalDeaths / dashboard.totalGames).toFixed(1)
      : "0";
  const avgAssists =
    dashboard && dashboard.totalGames > 0
      ? (dashboard.totalAssists / dashboard.totalGames).toFixed(1)
      : "0";
  const winRate =
    dashboard && dashboard.totalGames > 0
      ? ((dashboard.wins / dashboard.totalGames) * 100).toFixed(1) + "%"
      : "0%";

  const losses = dashboard ? dashboard.totalGames - dashboard.wins : 0;

  return (
    <div className="w-full space-y-4">
      {/* Stat Cards */}
      {dashboard && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Total Games"
            value={dashboard.totalGames}
            subtext={`${dashboard.wins}W ${losses}L · ${winRate} win rate`}
          />
          <StatCard
            label="Avg KDA"
            value={`${avgKills} / ${avgDeaths} / ${avgAssists}`}
            subtext={`${kdaRatio(dashboard.totalKills, dashboard.totalDeaths, dashboard.totalAssists)} KDA · ${dashboard.totalKills} / ${dashboard.totalDeaths} / ${dashboard.totalAssists} total`}
          />
          <div className="bg-lol-card rounded-xl border border-lol-border/60 p-4">
            <div className="text-[11px] text-lol-text uppercase tracking-wider mb-1">
              Multikills
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  {
                    kind: "doubles",
                    label: "D",
                    name: "double",
                    value: dashboard.multikills.doubles,
                    color: "text-sky-400",
                  },
                  {
                    kind: "triples",
                    label: "T",
                    name: "triple",
                    value: dashboard.multikills.triples,
                    color: "text-amber-400",
                  },
                  {
                    kind: "quadras",
                    label: "Q",
                    name: "quadra",
                    value: dashboard.multikills.quadras,
                    color: "text-purple-400",
                  },
                  {
                    kind: "pentas",
                    label: "P",
                    name: "penta",
                    value: dashboard.multikills.pentas,
                    color: "text-red-400",
                  },
                ] as {
                  kind: MultikillType;
                  label: string;
                  name: string;
                  value: number;
                  color: string;
                }[]
              ).map(({ kind, label, name, value, color }) => {
                const active = multikillFilter.includes(kind);
                return (
                  <button
                    key={label}
                    onClick={() => toggleMultikill(kind)}
                    title={`Only show games with a ${name} kill`}
                    className={`text-center rounded-md border px-1 py-0.5 transition-colors ${
                      active
                        ? "border-lol-gold/60 bg-lol-gold/10"
                        : "border-transparent hover:border-lol-border hover:bg-white/5"
                    }`}
                  >
                    <div className={`text-lg font-bold ${color}`}>{value}</div>
                    <div className="text-[10px] text-lol-text">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-lol-text-bright">Matches</h1>
        <div className="flex items-center gap-2">
          <select
            value={championFilter ?? ""}
            onChange={(e) =>
              setChampionFilter(e.target.value === "" ? undefined : Number(e.target.value))
            }
            className={SELECT_WIDE}
          >
            <option value="">All Champions</option>
            {championOptions.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={patchFilter ?? ""}
            onChange={(e) => setPatchFilter(e.target.value === "" ? undefined : e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All Patches</option>
            {filterOptions.patches.map((p) => (
              <option key={p} value={p}>
                Patch {formatPatch(p)}
              </option>
            ))}
          </select>
          {(filterOptions.queues.length > 1 || queueFilter !== undefined) && (
            <select
              value={queueFilter ?? ""}
              onChange={(e) =>
                setQueueFilter(e.target.value === "" ? undefined : Number(e.target.value))
              }
              className={SELECT_WIDE}
            >
              <option value="">All Queues</option>
              {filterOptions.queues.map((q) => (
                <option key={q} value={q}>
                  {queueLabel(q)}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1">
            <select
              value={sort ?? ""}
              onChange={(e) => {
                setSort(e.target.value === "" ? undefined : (e.target.value as MatchSort));
                setSortDir("desc");
              }}
              className={SELECT_SMALL}
            >
              <option value="">Sort</option>
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              title={
                !sort || sort === "date"
                  ? sortDir === "desc"
                    ? "Newest first"
                    : "Oldest first"
                  : sortDir === "desc"
                    ? "Highest first"
                    : "Lowest first"
              }
              className="flex items-center rounded-lg border border-lol-border bg-lol-card px-2 py-1.5 text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
            >
              {/* h-5 matches the selects' line-height so the boxes end up the same height */}
              <span className="flex h-5 items-center">
                <ArrowDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      {matches.length === 0 && !loading && (
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-lol-text">
          {championFilter !== undefined ||
          patchFilter !== undefined ||
          queueFilter !== undefined ||
          multikillFilter.length > 0
            ? "No games match the current filters."
            : emptyStateMessage(lcuStatus, backfill)}
        </div>
      )}

      <div className="space-y-1">
        {matches.map((m) => (
          <GameRow
            key={m.game_id}
            match={m}
            champData={champData}
            wide={wide}
            expanded={expandedId === m.game_id}
            detail={expandedId === m.game_id ? detail : null}
            detailLoading={expandedId === m.game_id && detailLoading}
            puuids={puuids}
            onToggle={() => toggleExpand(m.game_id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, match: m });
            }}
          />
        ))}
      </div>

      {hasMore && <div ref={sentinelRef} className="h-1" />}
      {loading && matches.length > 0 && (
        <div className="text-center py-3 text-sm text-lol-text">Loading...</div>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <button
            onClick={() => handleToggleFavorite(contextMenu.match)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-lol-text-bright hover:bg-white/5 text-left"
          >
            <span className={contextMenu.match.favorite ? "text-amber-400" : "text-lol-text"}>
              {contextMenu.match.favorite ? "★" : "☆"}
            </span>
            {contextMenu.match.favorite ? "Remove from Favorites" : "Add to Favorites"}
          </button>
        </ContextMenu>
      )}
    </div>
  );
}

function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("click", onClose);
    window.addEventListener("contextmenu", onClose, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("contextmenu", onClose, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Keep the menu inside the viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${y - rect.height}px`;
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-44 py-1 bg-lol-card border border-lol-border rounded-md shadow-lg shadow-black/40"
    >
      {children}
    </div>
  );
}

interface GameRowProps {
  match: MatchListItem;
  champData: any;
  // Wide windows scale the icons up and spread the row out; the icon
  // components size in pixels, so this can't be pure CSS
  wide: boolean;
  expanded: boolean;
  detail: MatchDetail | null;
  detailLoading: boolean;
  puuids: string[] | null;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function parseAugmentIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw.split(",").map(Number).filter(Boolean);
}

function AugmentGrid({ augmentIds, wide }: { augmentIds: number[]; wide: boolean }) {
  if (augmentIds.length === 0) return null;
  // Classic can grant bonus augments; spill past 4 into a third column so the
  // grid stays two rows tall and rows keep a uniform height. Wide windows
  // have room to lay them out in a single row at a larger size.
  const cols = wide
    ? "grid-flow-col auto-cols-max"
    : augmentIds.length > 4
      ? "grid-cols-3"
      : "grid-cols-2";
  return (
    <div className={`grid ${cols} gap-[clamp(2px,0.32vw,9px)] w-fit`}>
      {augmentIds.map((id, i) => (
        <AugmentIcon key={i} augmentId={id} size={wide ? 30 : 22} />
      ))}
    </div>
  );
}

function GameRow({
  match,
  champData,
  wide,
  expanded,
  detail,
  detailLoading,
  puuids,
  onToggle,
  onContextMenu,
}: GameRowProps) {
  const isRemake = !!match.is_remake;
  const isWin = !!match.win;
  const isFavorite = !!match.favorite;
  const kda = kdaRatio(match.kills, match.deaths, match.assists);
  const augmentIds = parseAugmentIds(match.augment_ids);

  const accent = isFavorite
    ? "bg-amber-400"
    : isRemake
      ? "bg-white/25"
      : isWin
        ? "bg-lol-win"
        : "bg-lol-loss";
  // Flat wash for the row, with the gradient confined to a short fade next
  // to the accent bar: a 0.12 -> 0.04 gradient stretched across a maximized
  // window is subtle enough to band on some displays.
  const wash = isRemake ? "bg-white/[0.015]" : isWin ? "bg-lol-win/[0.05]" : "bg-lol-loss/[0.05]";
  const tint = isRemake
    ? "from-white/[0.03]"
    : isWin
      ? "from-lol-win/[0.09]"
      : "from-lol-loss/[0.09]";

  return (
    <div>
      <button
        onClick={onToggle}
        onContextMenu={onContextMenu}
        className={`relative overflow-hidden w-full flex items-center gap-[clamp(0.75rem,0.85vw,1.75rem)] pl-4 pr-3 py-2.5 border border-lol-border/60 bg-lol-card hover:bg-lol-card-hover transition-colors text-left ${
          expanded ? "rounded-t-lg" : "rounded-lg"
        }`}
      >
        <span className={`absolute left-0 inset-y-0 w-[3px] ${accent}`} />
        <span className={`absolute inset-0 pointer-events-none ${wash}`} />
        <span
          className={`absolute inset-y-0 left-0 w-[320px] pointer-events-none bg-gradient-to-r to-transparent ${tint}`}
        />
        <div
          className={`text-xs font-bold shrink-0 ${isRemake ? "text-gray-500 w-8" : isWin ? "text-lol-win w-8" : "text-lol-loss w-8"}`}
        >
          {isRemake ? "RMK" : isWin ? "WIN" : "LOSS"}
        </div>
        <ChampionIcon championId={match.champion_id} size={wide ? 46 : 36} />
        <div className={`shrink-0 ${wide ? "w-32" : "w-24"}`}>
          <div className="text-sm text-lol-text-bright truncate">
            {getChampionName(champData, match.champion_id)}
          </div>
        </div>
        <div className="w-24 shrink-0">
          <div className="text-sm text-lol-text-bright">
            {formatKDA(match.kills, match.deaths, match.assists)}
          </div>
          <div className={`text-xs font-semibold ${kdaStringColor(kda)}`}>{kda} KDA</div>
        </div>

        {/* Score */}
        <div className="w-10 shrink-0 text-center">
          {match.score != null && !isRemake && (
            <>
              <div className={`text-sm font-semibold ${scoreRampColor(match.score)}`}>
                {match.score.toFixed(1)}
              </div>
              {match.score_badge ? (
                <div
                  className={`text-[9px] font-bold leading-[15px] px-1 rounded w-fit mx-auto ${
                    match.score_badge === "MVP"
                      ? "bg-amber-400/20 text-amber-300"
                      : "bg-purple-500/20 text-purple-400"
                  }`}
                >
                  {match.score_badge}
                </div>
              ) : (
                <div className="text-[10px] text-lol-text uppercase tracking-wider">score</div>
              )}
            </>
          )}
        </div>

        {/* Stat bars */}
        <StatBars
          damage={match.total_damage_dealt}
          taken={match.total_damage_taken}
          heal={match.total_heal}
          max={{
            dmg: match.game_max_dmg,
            taken: match.game_max_taken,
            heal: match.game_max_heal,
          }}
          className="w-40 shrink-0 min-[1500px]:w-auto min-[1500px]:shrink min-[1500px]:flex-1 min-[1500px]:max-w-[420px]"
        />

        {/* Augments – reserve 3 columns so mixed-queue lists stay aligned */}
        <div className={`shrink-0 ${wide ? "w-[200px]" : "w-[70px]"}`}>
          <AugmentGrid augmentIds={augmentIds} wide={wide} />
        </div>

        {/* Items – a 3x2 block normally, one row of six when there's room */}
        <div
          className={`shrink-0 grid gap-[clamp(2px,0.32vw,9px)] ${wide ? "grid-cols-6" : "grid-cols-3"}`}
        >
          {[match.item0, match.item1, match.item2, match.item3, match.item4, match.item5].map(
            (itemId, i) => (
              <ItemIcon
                key={i}
                itemId={itemId ?? 0}
                size={wide ? 30 : 22}
                patch={match.game_version}
              />
            ),
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-end gap-4">
          <MultikillBadge
            doubles={match.double_kills}
            triples={match.triple_kills}
            quadras={match.quadra_kills}
            pentas={match.penta_kills}
          />
          {/* Room at this width for a stat the narrow layout has to drop */}
          {wide && (
            <div className="text-right shrink-0 w-16">
              <div className="text-sm text-lol-text-bright">
                {(match.gold_earned / 1000).toFixed(1)}k
              </div>
              <div className="text-[10px] text-lol-text uppercase tracking-wider">gold</div>
            </div>
          )}
        </div>
        {/* Wide enough for a date and clock time now that this shows when the
            game was played rather than its age, and it grows with the window */}
        <div className="text-xs text-lol-text text-right shrink-0 w-[clamp(96px,7vw,136px)] whitespace-nowrap">
          <div>{formatDuration(match.game_duration)}</div>
          <div>{formatDateTime(match.game_creation)}</div>
        </div>
      </button>

      {expanded && (
        <div className="mb-1 bg-lol-dark/30 rounded-b-lg border border-t-0 border-lol-border/60 p-3">
          {detailLoading ? (
            <div className="text-sm text-lol-text text-center py-4">Loading...</div>
          ) : detail ? (
            <MatchScoreboard detail={detail} champData={champData} puuids={puuids} />
          ) : null}
        </div>
      )}
    </div>
  );
}
