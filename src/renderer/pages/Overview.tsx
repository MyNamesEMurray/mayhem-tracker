import { useState, useCallback, useEffect } from "react";
import { Button } from "../../shared/ui/primitives";
import { Link, useNavigate } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useNow } from "../hooks/useNow";
import { useOnWindowFocus } from "../hooks/useOnWindowFocus";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { useBackfill } from "../hooks/useBackfill";
import type { DashboardData, MatchListItem } from "../lib/types";
import ChampionIcon from "../../shared/ui/ChampionIcon";
import ItemIcon from "../components/ItemIcon";
import SummonerIcon from "../components/SummonerIcon";
import MultikillBadge from "../components/MultikillBadge";
import { StatTile } from "../../shared/ui/primitives";
import { RefreshIcon } from "../../shared/ui/icons";
import {
  formatTimeAgo,
  formatDateTime,
  formatKDA,
  kdaRatio,
  kdaStringColor,
  scoreRampColor,
} from "../lib/format";
import { queueLabel } from "../components/QueueSelect";

const RECENT_COUNT = 8;

interface SelfProfile {
  name: string;
  tag: string | null;
  icon: number | null;
}

// The app has no dedicated "who am I" IPC, so read the player's identity out
// of the most recent stored game (same raw shape parseParticipants handles).
function extractSelfProfile(raw: any, puuids: string[]): SelfProfile | null {
  if (!raw?.participants || puuids.length === 0) return null;
  const identities = raw.participantIdentities || [];
  for (let i = 0; i < raw.participants.length; i++) {
    const p = raw.participants[i];
    const player = identities[i]?.player;
    const puuid = p.puuid || player?.puuid || null;
    if (!puuid || !puuids.includes(puuid)) continue;
    const name =
      player?.gameName || player?.summonerName || p.summonerName || p.riotIdGameName || null;
    const tag = player?.tagLine || p.riotIdTagline || null;
    const icon = player?.profileIcon ?? p.profileIcon;
    return {
      name: name ?? "Unknown",
      tag,
      icon: typeof icon === "number" && icon > 0 ? icon : null,
    };
  }
  return null;
}

export default function Overview() {
  const navigate = useNavigate();
  const champData = useChampionData();
  const lcuStatus = useLcuStatus();
  const { running: backfilling, progress } = useBackfill();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<SelfProfile | null>(null);

  const { data: recent, refetch: refetchRecent } = useIpc<{
    matches: MatchListItem[];
    total: number;
  }>(() => window.api.getMatchHistory(RECENT_COUNT, 0), []);
  const { data: dashboard, refetch: refetchDashboard } = useIpc<DashboardData>(
    () => window.api.getDashboard(),
    [],
  );

  useEffect(
    () =>
      window.api.onGamesUpdated(() => {
        refetchRecent();
        refetchDashboard();
      }),
    [refetchRecent, refetchDashboard],
  );

  useOnWindowFocus(() => {
    refetchRecent();
    refetchDashboard();
  });

  const latestGameId = recent?.matches[0]?.game_id;

  useEffect(() => {
    if (latestGameId == null) return;
    let active = true;
    Promise.all([window.api.getMatchDetail(latestGameId), window.api.getAllSummonerPuuids()])
      .then(([detail, puuids]) => {
        if (!active) return;
        const p = extractSelfProfile(detail.raw, puuids);
        if (p) setProfile(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [latestGameId]);

  useEffect(() => {
    if (!refreshMessage) return;
    const timer = setTimeout(() => setRefreshMessage(null), 10_000);
    return () => clearTimeout(timer);
  }, [refreshMessage]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await window.api.refreshGames();
      if ("error" in result) {
        setRefreshMessage(`Error: ${result.error}`);
      } else {
        // "Up to date" rather than "no new games": the list may still have
        // moved, since background syncs store games between clicks
        setRefreshMessage(
          result.newGames > 0 ? `Found ${result.newGames} new game(s)` : "Up to date",
        );
      }
      // Always re-read what's stored: a game the background sync already
      // picked up counts as "no new games" here, and the list would
      // otherwise keep showing whatever it loaded with
      refetchRecent();
      refetchDashboard();
    } catch (err: any) {
      // Strip Electron's IPC wrapper so only the underlying message shows
      const message = String(err?.message ?? err).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        "",
      );
      setRefreshMessage(`Error: ${message}`);
    } finally {
      setRefreshing(false);
    }
  }, [refetchRecent, refetchDashboard]);

  const totalGames = dashboard?.totalGames ?? 0;
  const wins = dashboard?.wins ?? 0;
  const losses = totalGames - wins;
  const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) + "%" : "-";
  const kda = dashboard
    ? kdaRatio(dashboard.totalKills, dashboard.totalDeaths, dashboard.totalAssists)
    : "-";
  const avg = (total: number) => (totalGames > 0 ? (total / totalGames).toFixed(1) : "0");

  // Ticks the minute counter below while the window stays open
  useNow();

  const latest = recent?.matches[0];
  const updatedText =
    refreshMessage ??
    (backfilling
      ? progress && progress.total > 0
        ? `Importing ${progress.current}/${progress.total}...`
        : "Importing history..."
      : latest
        ? // Counts from when the game ended, not when it started: a 28-minute
          // game that began 34 minutes ago finished 6 minutes ago, and how
          // long since you last played is what this is answering.
          `Last game ${formatTimeAgo(latest.game_creation + latest.game_duration * 1000)}`
        : null);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Profile row */}
      <div className="flex items-center gap-3.5">
        <SummonerIcon
          iconId={profile?.icon ?? null}
          size={52}
          className="border-2 border-lol-gold/40"
        />
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[17px] font-bold text-lol-gold">
              {profile?.name ?? "Summoner"}
            </span>
            {profile?.tag && <span className="text-[13px] text-lol-text">#{profile.tag}</span>}
          </div>
          <p className="text-xs text-lol-text mt-0.5">
            ARAM Mayhem · {totalGames} game{totalGames === 1 ? "" : "s"} recorded
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {updatedText && (
            <span className="text-xs text-lol-text truncate" title={updatedText}>
              {updatedText}
            </span>
          )}
          <Button onClick={handleRefresh} disabled={refreshing || backfilling}>
            <RefreshIcon className={`w-[13px] h-[13px] ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 min-[880px]:grid-cols-4 gap-3">
        <StatTile label="Games" value={totalGames} sub="all time" />
        <StatTile
          label="Win rate"
          value={winRate}
          valueClassName={totalGames > 0 ? "text-lol-win" : "text-lol-text-bright"}
          sub={`${wins} W · ${losses} L`}
        />
        <StatTile
          label="KDA"
          value={kda}
          valueClassName={dashboard ? kdaStringColor(kda) : "text-lol-text-bright"}
          sub={`${avg(dashboard?.totalKills ?? 0)} / ${avg(dashboard?.totalDeaths ?? 0)} / ${avg(dashboard?.totalAssists ?? 0)}`}
        />
        <StatTile
          label="Pentakills"
          value={dashboard?.multikills.pentas ?? 0}
          sub={`${dashboard?.multikills.quadras ?? 0} quadrakills`}
        />
      </div>

      {/* Recent matches */}
      <div className="bg-lol-card border border-lol-border/60 rounded-xl overflow-hidden">
        <div className="flex items-center px-4 pt-3.5 pb-2.5">
          <span className="text-[11px] text-lol-text uppercase tracking-[0.08em]">
            Recent matches
          </span>
          <Link
            to="/matches"
            className="ml-auto text-xs text-lol-gold hover:text-lol-gold-light transition-colors"
          >
            View all →
          </Link>
        </div>
        {recent && recent.matches.length === 0 && (
          <div className="border-t border-lol-border/50 px-4 py-8 text-center text-sm text-lol-text">
            {backfilling
              ? "Importing your match history..."
              : lcuStatus !== "connected"
                ? "Waiting for the League client. Once it's open, your Mayhem games import automatically."
                : "No ARAM Mayhem games found yet. New games are recorded as you play."}
          </div>
        )}
        {recent?.matches.map((m) => (
          <RecentMatchRow
            key={m.game_id}
            match={m}
            champData={champData}
            onClick={() => navigate(`/matches?game=${m.game_id}`)}
          />
        ))}
      </div>
    </div>
  );
}

function RecentMatchRow({
  match: m,
  champData,
  onClick,
}: {
  match: MatchListItem;
  champData: any;
  onClick: () => void;
}) {
  const isRemake = !!m.is_remake;
  const isWin = !!m.win;
  const kda = kdaRatio(m.kills, m.deaths, m.assists);
  const edge = isRemake ? "border-l-white/25" : isWin ? "border-l-lol-win" : "border-l-lol-loss";
  const metaLine = `${queueLabel(m.queue_id)} · ${Math.round(m.game_duration / 60)}m · ${formatDateTime(
    m.game_creation,
  )}`;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 pl-3 pr-4 py-2.5 border-t border-lol-border/50 border-l-[3px] ${edge} hover:bg-lol-card-hover transition-colors cursor-pointer text-left`}
    >
      <ChampionIcon championId={m.champion_id} size={38} />
      {/* 130px cut the line short at every window size, and what it cut was
          always the end - when the game was played. Sized to fit that line and
          allowed to grow with the window, with the full text on hover as a
          backstop for the rare long form (a game from a previous year). */}
      <div className="w-[clamp(245px,16vw,270px)] shrink-0">
        <div className="text-[13px] font-semibold text-lol-text-bright truncate">
          {getChampionName(champData, m.champion_id)}
        </div>
        <div className="text-[11px] text-lol-text truncate" title={metaLine}>
          {metaLine}
        </div>
      </div>
      <div className="w-[110px] shrink-0">
        <div className="text-[13px] text-lol-text-bright">
          {formatKDA(m.kills, m.deaths, m.assists)}
        </div>
        <div className={`text-[11px] font-semibold ${kdaStringColor(kda)}`}>{kda} KDA</div>
      </div>
      <div className="max-[680px]:hidden flex items-center gap-1">
        {m.score_badge && !isRemake && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              m.score_badge === "MVP"
                ? "bg-amber-400/20 text-amber-300"
                : "bg-purple-500/20 text-purple-400"
            }`}
          >
            {m.score_badge}
          </span>
        )}
        <MultikillBadge
          doubles={m.double_kills}
          triples={m.triple_kills}
          quadras={m.quadra_kills}
          pentas={m.penta_kills}
        />
      </div>
      <div className="ml-auto max-[900px]:hidden flex gap-0.5 shrink-0">
        {[m.item0, m.item1, m.item2, m.item3, m.item4, m.item5].map((itemId, i) => (
          <ItemIcon key={i} itemId={itemId ?? 0} size={22} patch={m.game_version} />
        ))}
      </div>
      <div className="w-14 shrink-0 text-right min-[901px]:ml-0 ml-auto">
        {m.score != null && !isRemake ? (
          <>
            <span className={`text-[13px] font-bold ${scoreRampColor(m.score)}`}>
              {m.score.toFixed(1)}
            </span>
            <span className="text-[11px] text-lol-text"> / 10</span>
          </>
        ) : (
          <span className="text-[11px] text-lol-text">{isRemake ? "Remake" : "-"}</span>
        )}
      </div>
    </button>
  );
}
