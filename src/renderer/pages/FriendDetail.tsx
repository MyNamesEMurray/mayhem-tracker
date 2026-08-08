import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import type { TeammateDetail, TeammateMatch, MatchDetail } from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import SummonerIcon from "../components/SummonerIcon";
import MatchScoreboard from "../components/MatchScoreboard";
import StatCard from "../components/StatCard";
import { formatDuration, formatTimeAgo, formatKDA, kdaRatio } from "../lib/format";
import { scoreColor } from "../../shared/opScore";

export default function FriendDetail() {
  const { key = "" } = useParams();
  const champData = useChampionData();
  const { data, loading, refetch } = useIpc<TeammateDetail | null>(
    () => window.api.getTeammateDetail(key),
    [key],
  );
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

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
        setDetail(await window.api.getMatchDetail(gameId));
      } finally {
        setDetailLoading(false);
      }
    },
    [expandedId],
  );

  if (loading) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  if (!data) {
    return (
      <div className="max-w-5xl space-y-4">
        <BackLink />
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-lol-text">
          No games found with this player.
        </div>
      </div>
    );
  }

  const { player, matches } = data;
  const losses = player.games - player.wins;
  const winRate = player.games > 0 ? (player.wins / player.games) * 100 : 0;
  const avg = (total: number) => (player.games > 0 ? (total / player.games).toFixed(1) : "0.0");
  const yourWins = matches.filter((m) => m.win).length;

  return (
    <div className="max-w-5xl space-y-4">
      <BackLink />

      <div className="flex items-center gap-3">
        <SummonerIcon iconId={player.profileIcon} size={48} />
        <div>
          <h1 className="text-xl font-bold text-lol-text-bright">{player.name}</h1>
          <span className="text-sm text-lol-text">
            Last played {formatTimeAgo(player.lastPlayed)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Games Together"
          value={player.games}
          subtext={`${player.wins}W ${losses}L · ${winRate.toFixed(1)}% win rate`}
        />
        <StatCard
          label="Their KDA"
          value={`${avg(player.kills)} / ${avg(player.deaths)} / ${avg(player.assists)}`}
          subtext={`${kdaRatio(player.kills, player.deaths, player.assists)} KDA · ${player.kills} / ${player.deaths} / ${player.assists} total`}
        />
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-4">
          <div className="text-[11px] text-lol-text uppercase tracking-wider mb-2">
            Their Champions
          </div>
          <div className="flex items-center gap-1.5">
            {player.champions.slice(0, 5).map((c) => (
              <div key={c.champion_id} className="relative group">
                <ChampionIcon championId={c.champion_id} size={30} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-lol-dark border border-lol-border rounded px-2 py-1 text-[10px] text-lol-text-bright whitespace-nowrap z-10">
                  {getChampionName(champData, c.champion_id)} ({c.games})
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-lol-text-bright uppercase tracking-wider">
          Games Played Together
        </h2>
        <span className="text-xs text-lol-text">
          Your record in these games: {yourWins}W {matches.length - yourWins}L
        </span>
      </div>

      <div className="space-y-1">
        {matches.map((m) => (
          <SharedGameRow
            key={m.game_id}
            match={m}
            champData={champData}
            friendName={player.name}
            expanded={expandedId === m.game_id}
            detail={expandedId === m.game_id ? detail : null}
            detailLoading={expandedId === m.game_id && detailLoading}
            puuids={puuids}
            onToggle={() => toggleExpand(m.game_id)}
          />
        ))}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/friends"
      className="inline-flex items-center gap-1.5 text-xs text-lol-text hover:text-lol-text-bright transition-colors"
    >
      <span aria-hidden>←</span> Friends
    </Link>
  );
}

function PlayerBlock({
  label,
  championId,
  champData,
  kills,
  deaths,
  assists,
  score,
  badge,
}: {
  label: string;
  championId: number;
  champData: any;
  kills: number;
  deaths: number;
  assists: number;
  score: number | null;
  badge: "MVP" | "ACE" | null;
}) {
  const kda = kdaRatio(kills, deaths, assists);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <ChampionIcon championId={championId} size={32} />
      <div className="min-w-0 w-24">
        <div className="text-[10px] text-lol-text uppercase tracking-wider truncate" title={label}>
          {label}
        </div>
        <div className="text-xs text-lol-text-bright truncate">
          {getChampionName(champData, championId)}
        </div>
      </div>
      <div className="w-20 shrink-0">
        <div className="text-xs text-lol-text-bright">{formatKDA(kills, deaths, assists)}</div>
        <div
          className={`text-[10px] ${parseFloat(kda) >= 3 || kda === "Perfect" ? "text-lol-gold" : "text-lol-text"}`}
        >
          {kda} KDA
        </div>
      </div>
      <div className="w-10 shrink-0 text-center">
        {score != null && (
          <>
            <div className={`text-sm font-semibold ${scoreColor(score)}`}>{score.toFixed(1)}</div>
            {badge ? (
              <div
                className={`text-[9px] font-bold leading-[15px] px-1 rounded w-fit mx-auto ${
                  badge === "MVP"
                    ? "bg-amber-400/20 text-amber-300"
                    : "bg-purple-500/20 text-purple-400"
                }`}
              >
                {badge}
              </div>
            ) : (
              <div className="text-[10px] text-lol-text uppercase tracking-wider">score</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SharedGameRow({
  match,
  champData,
  friendName,
  expanded,
  detail,
  detailLoading,
  puuids,
  onToggle,
}: {
  match: TeammateMatch;
  champData: any;
  friendName: string;
  expanded: boolean;
  detail: MatchDetail | null;
  detailLoading: boolean;
  puuids: string[] | null;
  onToggle: () => void;
}) {
  const isWin = !!match.win;
  const accent = isWin ? "bg-lol-win" : "bg-lol-loss";
  const tint = isWin ? "from-lol-win/12 to-lol-win/[0.04]" : "from-lol-loss/12 to-lol-loss/[0.04]";

  return (
    <div>
      <button
        onClick={onToggle}
        className={`relative overflow-hidden w-full flex items-center gap-4 pl-4 pr-3 py-2.5 border border-lol-border/60 bg-lol-card hover:bg-lol-card-hover transition-colors text-left ${
          expanded ? "rounded-t-lg" : "rounded-lg"
        }`}
      >
        <span className={`absolute left-0 inset-y-0 w-[3px] ${accent}`} />
        <span className={`absolute inset-0 pointer-events-none bg-gradient-to-r ${tint}`} />
        <div
          className={`text-xs font-bold shrink-0 w-8 ${isWin ? "text-lol-win" : "text-lol-loss"}`}
        >
          {isWin ? "WIN" : "LOSS"}
        </div>

        <PlayerBlock
          label="You"
          championId={match.champion_id}
          champData={champData}
          kills={match.kills}
          deaths={match.deaths}
          assists={match.assists}
          score={match.score}
          badge={match.score_badge}
        />

        <PlayerBlock
          label={friendName}
          championId={match.friend.champion_id}
          champData={champData}
          kills={match.friend.kills}
          deaths={match.friend.deaths}
          assists={match.friend.assists}
          score={match.friend.score}
          badge={match.friend.score_badge}
        />

        <div className="flex-1" />
        <div className="text-xs text-lol-text text-right shrink-0">
          <div>{formatDuration(match.game_duration)}</div>
          <div>{formatTimeAgo(match.game_creation)}</div>
        </div>
      </button>

      {expanded && (
        <div className="mb-1 bg-lol-card rounded-b-lg border border-t-0 border-lol-border/60 p-3">
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
