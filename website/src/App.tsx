import { useEffect, useMemo, useState } from "react";
import {
  fetchAugmentStats,
  fetchChampionStats,
  fetchItemStats,
  type AugmentStatRow,
  type ChampionStatRow,
  type ItemStatRow,
} from "./lib/api";
import {
  loadAugmentData,
  loadChampionData,
  type AugmentData,
  type ChampionData,
} from "./lib/dragon";
import { aggregateChampions, availablePatches, availableQueues, QUEUE_LABELS, type Filters } from "./lib/stats";
import { useUrlParams } from "./lib/urlState";
import AugmentsTable from "./components/AugmentsTable";
import ChampionDetail from "./components/ChampionDetail";
import ChampionsTable from "./components/ChampionsTable";

type Tab = "augments" | "champions";

interface LoadedData {
  championRows: ChampionStatRow[];
  augmentRows: AugmentStatRow[];
  itemRows: ItemStatRow[];
  championData: ChampionData;
  augmentData: AugmentData;
}

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParam] = useUrlParams();

  const tab: Tab = params.get("tab") === "champions" ? "champions" : "augments";
  const patch = params.get("patch") ?? undefined;
  const queueParam = params.get("queue");
  const queue = queueParam ? Number(queueParam) : undefined;
  const championParam = params.get("champion");
  const selectedChampion = championParam ? Number(championParam) : null;
  const filters: Filters = useMemo(() => ({ patch, queue }), [patch, queue]);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([
      fetchChampionStats(),
      fetchAugmentStats(),
      fetchItemStats(),
      loadChampionData(),
      loadAugmentData(),
    ])
      .then(([championRows, augmentRows, itemRows, championData, augmentData]) => {
        if (active) setData({ championRows, augmentRows, itemRows, championData, augmentData });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const patches = useMemo(() => (data ? availablePatches(data.championRows) : []), [data]);
  const queues = useMemo(() => (data ? availableQueues(data.championRows) : []), [data]);
  // Every participant slot under the current filter; the denominator for pick
  // rates and (÷10) the game count
  const totalSlots = useMemo(
    () =>
      data
        ? aggregateChampions(data.championRows, filters).reduce((sum, c) => sum + c.games, 0)
        : 0,
    [data, filters],
  );
  const totalGames = Math.round(totalSlots / 10);

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" width={40} height={40} className="rounded-lg" />
            <div>
              <h1 className="text-2xl font-bold text-lol-text-bright">Mayhem Tracker</h1>
              <p className="text-sm text-lol-text">
                Community augment &amp; champion stats for ARAM Mayhem
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="bg-lol-card border border-lol-loss/40 rounded-xl p-5 text-sm">
            <p className="text-lol-loss mb-2">Couldn't load community stats: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!error && !data && <div className="text-center text-lol-text py-20">Loading community stats...</div>}

        {data && selectedChampion != null && (
          <>
            <div className="flex justify-end mb-4">
              <div className="flex items-center gap-2">
                <select
                  className="select"
                  value={queue ?? ""}
                  onChange={(e) => setParam("queue", e.target.value || null)}
                >
                  <option value="">All queues</option>
                  {queues.map((q) => (
                    <option key={q} value={q}>
                      {QUEUE_LABELS[q] ?? `Queue ${q}`}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={patch ?? ""}
                  onChange={(e) => setParam("patch", e.target.value || null)}
                >
                  <option value="">All patches</option>
                  {patches.map((p) => (
                    <option key={p} value={p}>
                      Patch {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ChampionDetail
              championId={selectedChampion}
              championRows={data.championRows}
              augmentRows={data.augmentRows}
              itemRows={data.itemRows}
              filters={filters}
              championData={data.championData}
              augmentData={data.augmentData}
              onBack={() => setParam("champion", null)}
            />
          </>
        )}

        {data && selectedChampion == null && (
          <>
            {/* Filters + summary */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setParam("tab", null)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    tab === "augments"
                      ? "bg-lol-gold/20 text-lol-gold border-lol-gold/50"
                      : "text-lol-text border-lol-border bg-lol-card hover:border-lol-border/80"
                  }`}
                >
                  Augments
                </button>
                <button
                  onClick={() => setParam("tab", "champions")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    tab === "champions"
                      ? "bg-lol-gold/20 text-lol-gold border-lol-gold/50"
                      : "text-lol-text border-lol-border bg-lol-card hover:border-lol-border/80"
                  }`}
                >
                  Champions
                </button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-lol-text mr-1">
                  {totalGames.toLocaleString()} community games
                </span>
                <select
                  className="select"
                  value={queue ?? ""}
                  onChange={(e) => setParam("queue", e.target.value || null)}
                >
                  <option value="">All queues</option>
                  {queues.map((q) => (
                    <option key={q} value={q}>
                      {QUEUE_LABELS[q] ?? `Queue ${q}`}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={patch ?? ""}
                  onChange={(e) => setParam("patch", e.target.value || null)}
                >
                  <option value="">All patches</option>
                  {patches.map((p) => (
                    <option key={p} value={p}>
                      Patch {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {tab === "augments" ? (
              <AugmentsTable
                rows={data.augmentRows}
                filters={filters}
                totalSlots={totalSlots}
                augmentData={data.augmentData}
                championData={data.championData}
                onSelectChampion={(id) => setParam("champion", String(id))}
              />
            ) : (
              <ChampionsTable
                rows={data.championRows}
                filters={filters}
                totalSlots={totalSlots}
                championData={data.championData}
                onSelectChampion={(id) => setParam("champion", String(id))}
              />
            )}
          </>
        )}

        {/* Footer */}
        <footer className="mt-10 pt-6 border-t border-lol-border/50 space-y-3 text-xs text-lol-text/80">
          <p>
            Powered by anonymized games contributed by{" "}
            <a
              href="https://github.com/MyNamesEMurray/mayhem-tracker"
              className="text-lol-gold hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Mayhem Tracker
            </a>{" "}
            players who opted in. Contributions contain champions, augments, items, and combat
            stats only — never summoner names, Riot IDs, or anything that identifies a player.
            Want your games counted? Install the tracker and flip on{" "}
            <span className="text-lol-text">Settings → Community Stats</span>.
          </p>
          <p>
            Mayhem Tracker isn't endorsed by Riot Games and doesn't reflect the views or opinions
            of Riot Games or anyone officially involved in producing or managing League of
            Legends. League of Legends and Riot Games are trademarks or registered trademarks of
            Riot Games, Inc.
          </p>
        </footer>
      </div>
    </div>
  );
}
