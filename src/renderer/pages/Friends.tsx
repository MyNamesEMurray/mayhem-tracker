import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import type { TeammateStats } from "../lib/types";
import ChampionIcon from "../../shared/ui/ChampionIcon";
import SummonerIcon from "../components/SummonerIcon";
import WinRateBar from "../../shared/ui/WinRateBar";
import { formatTimeAgo, kdaRatio, kdaColor } from "../lib/format";
import SortHeader, { useSort } from "../../shared/ui/SortHeader";
import SearchField from "../../shared/ui/SearchField";

type SortKey = "games" | "winRate" | "kda" | "lastPlayed" | "name";

export default function Friends() {
  const navigate = useNavigate();
  const champData = useChampionData();
  const { data, loading, refetch } = useIpc<TeammateStats[]>(() => window.api.getTeammateStats());
  const [search, setSearch] = useState("");
  const { sort, toggle } = useSort<SortKey>("games");
  const { key: sortKey, dir: sortDir } = sort;

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const sorted = useMemo(() => {
    if (!data) return [];
    let filtered = data.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

    filtered.sort((a, b) => {
      if (sortKey === "name") {
        const cmp = a.name.localeCompare(b.name);
        return sortDir === "asc" ? cmp : -cmp;
      }
      let av: number, bv: number;
      switch (sortKey) {
        case "winRate":
          av = a.games > 0 ? a.wins / a.games : 0;
          bv = b.games > 0 ? b.wins / b.games : 0;
          break;
        case "kda":
          av = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists;
          bv = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : b.kills + b.assists;
          break;
        case "lastPlayed":
          av = a.lastPlayed;
          bv = b.lastPlayed;
          break;
        default:
          av = a.games;
          bv = b.games;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [data, search, sortKey, sortDir]);

  if (loading || !data) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  const sortProps = { sort, onSort: toggle };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-lol-text-bright">Friends</h1>
          <span className="text-sm text-lol-text">{sorted.length} players · 2+ games together</span>
        </div>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search player..."
          width={192}
        />
      </div>

      <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-lol-dark/50">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em] w-12">
                #
              </th>
              <SortHeader label="Player" field="name" naturalDir="asc" {...sortProps} />
              <SortHeader label="Games" field="games" {...sortProps} />
              <SortHeader label="Win Rate" field="winRate" {...sortProps} />
              <SortHeader label="Their KDA" field="kda" {...sortProps} />
              {/* A row of champion icons, not a value — there is no order to
                  put them in */}
              <th className="px-3 py-2 text-left text-[11px] font-medium text-lol-text uppercase tracking-[0.08em]">
                Top Champions
              </th>
              <SortHeader label="Last Played" field="lastPlayed" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const avgKills = t.games > 0 ? t.kills / t.games : 0;
              const avgDeaths = t.games > 0 ? t.deaths / t.games : 0;
              const avgAssists = t.games > 0 ? t.assists / t.games : 0;
              const ratio =
                avgDeaths > 0 ? (avgKills + avgAssists) / avgDeaths : avgKills + avgAssists;
              const ratioStr = kdaRatio(t.kills, t.deaths, t.assists);

              return (
                <tr
                  key={t.key}
                  onClick={() => navigate(`/friends/${encodeURIComponent(t.key)}`)}
                  className="border-t border-lol-border/50 hover:bg-lol-card-hover cursor-pointer transition-colors"
                >
                  <td className="px-3 py-1.5 text-xs text-lol-text">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <SummonerIcon iconId={t.profileIcon} size={28} />
                      <span className="text-sm text-lol-text-bright">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-sm text-lol-text-bright">{t.games}</td>
                  <td className="px-3 py-1.5 w-32">
                    <WinRateBar wins={t.wins} total={t.games} />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-col">
                      <span className={`text-sm ${kdaColor(ratio)}`}>{ratioStr}</span>
                      <span className="text-[10px] text-lol-text">
                        {avgKills.toFixed(1)} / {avgDeaths.toFixed(1)} / {avgAssists.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      {t.champions.slice(0, 3).map((c) => (
                        <div key={c.champion_id} className="relative group">
                          <ChampionIcon championId={c.champion_id} size={24} />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-lol-dark border border-lol-border rounded px-2 py-1 text-[10px] text-lol-text-bright whitespace-nowrap z-10">
                            {getChampionName(champData, c.champion_id)} ({c.games.toLocaleString()})
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-sm text-lol-text">
                    {formatTimeAgo(t.lastPlayed)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-8 text-center text-sm text-lol-text">No players found</div>
        )}
      </div>
    </div>
  );
}
