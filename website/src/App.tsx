import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  aggregateChampions,
  availablePatches,
  availableQueues,
  MIN_SAMPLE,
  QUEUE_LABELS,
  type Filters,
} from "./lib/stats";
import AdSlot from "./components/AdSlot";
import AugmentsTable from "./components/AugmentsTable";
import ChampionDetail from "./components/ChampionDetail";
import ChampionsTable from "./components/ChampionsTable";
import PatchRangeSelect, {
  parsePatchParam,
  selectionPatchSet,
} from "./components/PatchRangeSelect";
import { AD_SLOTS, loadAdSense } from "./lib/adsense";
import { championSlug } from "./lib/slug";
import { useUrlState } from "./lib/urlState";

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
  const { path, params, setParam, navigate, replaceUrl } = useUrlState();

  // Champions tier list is the home tab; ?tab=champions from legacy links
  // simply falls through to the default
  const tab: Tab = params.get("tab") === "augments" ? "augments" : "champions";
  const patchParam = params.get("patch");
  const queueParam = params.get("queue");

  // Champion pages live at /champion/<slug>/ (prerendered server-side); the
  // old ?champion=<id> links are honored and canonicalized below
  const slugMatch = path.match(/^\/champion\/([a-z0-9-]+)\/?$/);
  const championSlugFromPath = slugMatch ? slugMatch[1] : null;
  const legacyChampion = params.get("champion");
  const onChampionPage = championSlugFromPath != null || legacyChampion != null;

  const selectedChampion = useMemo(() => {
    if (championSlugFromPath) {
      if (!data) return null;
      for (const [id, info] of Object.entries(data.championData)) {
        if (championSlug(info.name) === championSlugFromPath) return Number(id);
      }
      return null;
    }
    return legacyChampion ? Number(legacyChampion) : null;
  }, [championSlugFromPath, legacyChampion, data]);

  // The prerendered static block is superseded once the live app has data
  useEffect(() => {
    if (data) document.getElementById("prerender")?.remove();
  }, [data]);

  // Canonicalize legacy ?champion=<id> links to the path form
  useEffect(() => {
    if (!legacyChampion || !data) return;
    const name = data.championData[Number(legacyChampion)]?.name;
    if (!name) return;
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.delete("champion");
    replaceUrl(`/champion/${championSlug(name)}/`, nextParams);
  }, [legacyChampion, data, replaceUrl]);

  const openChampion = useCallback(
    (id: number) => {
      const name = data?.championData[id]?.name;
      if (name) navigate(`/champion/${championSlug(name)}/`);
      else setParam("champion", String(id));
    },
    [data, navigate, setParam],
  );

  useEffect(() => {
    loadAdSense();
  }, []);

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

  // ARAM Mayhem is the default queue; ?queue=all widens to everything. The
  // default only applies when that queue actually has data.
  const DEFAULT_QUEUE = 2400;
  const queue =
    queueParam === "all"
      ? undefined
      : queueParam
        ? Number(queueParam)
        : queues.includes(DEFAULT_QUEUE)
          ? DEFAULT_QUEUE
          : undefined;

  // Default view is the current patch; ?patch= also supports "all", a single
  // patch, or an inclusive "A-B" range
  const patchSet = useMemo(
    () => selectionPatchSet(parsePatchParam(patchParam, patches), patches),
    [patchParam, patches],
  );
  const filters: Filters = useMemo(() => ({ patches: patchSet, queue }), [patchSet, queue]);
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

  // Hide entries below the low-sample threshold (the *-marked ones)
  const confidentOnly = params.get("min") === "20";
  const minGames = confidentOnly ? MIN_SAMPLE : 0;
  const toggleConfident = useCallback(
    () => setParam("min", confidentOnly ? null : "20"),
    [setParam, confidentOnly],
  );

  // Human label for the current patch selection, shown in page titles
  const patchLabel = !patchParam
    ? patches.length
      ? `Patch ${patches[0]}`
      : ""
    : patchParam === "all"
      ? "All patches"
      : patchParam.includes("-")
        ? `Patches ${patchParam.replace("-", "–")}`
        : `Patch ${patchParam}`;

  const navTab = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`flex items-center px-3.5 text-[13px] font-semibold transition-colors ${
        active
          ? "text-lol-gold-light shadow-[inset_0_-2px_0_#c89b3c]"
          : "text-lol-text hover:text-lol-gold-light"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      {/* Unified chrome: full-width bar, frozen to the top on desktop */}
      <header className="md:sticky md:top-0 md:z-40 bg-lol-dark/85 backdrop-blur-md border-b border-lol-border/60">
        <div className="max-w-[1120px] min-[1500px]:max-w-[1320px] mx-auto px-6 flex items-center gap-6 flex-wrap min-[841px]:flex-nowrap">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
            className="flex items-center gap-2 py-3 font-extrabold text-[17px] tracking-[.03em] text-lol-gold-light shrink-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c89b3c"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
              <line x1="13" x2="19" y1="19" y2="13" />
              <line x1="16" x2="20" y1="16" y2="20" />
              <line x1="19" x2="21" y1="21" y2="19" />
              <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 10" />
              <line x1="5" x2="9" y1="14" y2="18" />
              <line x1="7" x2="4" y1="17" y2="20" />
              <line x1="3" x2="5" y1="19" y2="21" />
            </svg>
            <span>
              MAYHEM<span className="text-lol-gold">STATS</span>
            </span>
          </a>
          <nav className="flex gap-1 self-stretch">
            {navTab("Champions", tab === "champions" || onChampionPage, () => {
              if (onChampionPage) navigate("/");
              setParam("tab", null);
            })}
            {navTab("Augments", tab === "augments" && !onChampionPage, () => {
              if (onChampionPage) navigate("/");
              setParam("tab", "augments");
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 py-2 max-[840px]:ml-0 max-[840px]:w-full max-[840px]:pt-0 max-[840px]:pb-2.5 max-[840px]:flex-wrap">
            <select
              className="select"
              value={queueParam ?? ""}
              onChange={(e) => setParam("queue", e.target.value || null)}
            >
              <option value="">{QUEUE_LABELS[2400]}</option>
              {queues
                .filter((q) => q !== 2400)
                .map((q) => (
                  <option key={q} value={q}>
                    {QUEUE_LABELS[q] ?? `Queue ${q}`}
                  </option>
                ))}
              <option value="all">All queues</option>
            </select>
            <PatchRangeSelect
              patches={patches}
              param={patchParam}
              onChange={(v) => setParam("patch", v)}
            />
            <a
              href="https://github.com/MyNamesEMurray/mayhem-tracker/releases/latest"
              target="_blank"
              rel="noreferrer"
              title="Download the Mayhem Tracker desktop app — play, track, and contribute your games"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-lol-gold/50 bg-lol-gold/15 text-lol-gold text-[13px] font-semibold whitespace-nowrap transition-colors hover:bg-lol-gold/25"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M4 21h16" />
              </svg>
              Download app
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-[1120px] min-[1500px]:max-w-[1320px] mx-auto px-6 pt-7 pb-14">

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

        {data && onChampionPage && selectedChampion == null && (
          <div className="space-y-4">
            <button onClick={() => navigate("/")} className="text-sm text-lol-gold hover:underline">
              ← All champions
            </button>
            <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-sm text-lol-text">
              No champion found at this address.
            </div>
          </div>
        )}

        {data && onChampionPage && selectedChampion != null && (
          <>
            <ChampionDetail
              championId={selectedChampion}
              championRows={data.championRows}
              augmentRows={data.augmentRows}
              itemRows={data.itemRows}
              filters={filters}
              minGames={minGames}
              championData={data.championData}
              augmentData={data.augmentData}
              onBack={() => navigate("/")}
            />
          </>
        )}

        {data && !onChampionPage && (
          <>
            {/* Page title */}
            <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
              <h1 className="text-[22px] font-extrabold text-lol-gold-light m-0">
                {tab === "champions" ? "ARAM Mayhem tier list" : "Augment tier list"}
              </h1>
              <span className="text-xs">
                {patchLabel} · {totalGames.toLocaleString()} games
              </span>
            </div>
            <p className="text-[13px] mb-4">
              {tab === "champions"
                ? "Every champion ranked by score — win rate shrunk toward 50% for small samples."
                : "Augments ranked within their rarity — click a row for the champions it carries hardest."}
            </p>

            <AdSlot slot={AD_SLOTS.top} />

            {tab === "augments" ? (
              <AugmentsTable
                rows={data.augmentRows}
                filters={filters}
                totalSlots={totalSlots}
                minGames={minGames}
                confidentOnly={confidentOnly}
                onToggleConfident={toggleConfident}
                augmentData={data.augmentData}
                championData={data.championData}
                onSelectChampion={openChampion}
              />
            ) : (
              <ChampionsTable
                rows={data.championRows}
                filters={filters}
                totalSlots={totalSlots}
                minGames={minGames}
                confidentOnly={confidentOnly}
                onToggleConfident={toggleConfident}
                championData={data.championData}
                onSelectChampion={openChampion}
              />
            )}
          </>
        )}

        <AdSlot slot={AD_SLOTS.bottom} />

        {/* Footer */}
        <footer className="mt-10 pt-6 border-t border-lol-border/50 space-y-3 text-xs text-lol-text/80">
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-lol-text">
            <a href="/about/" className="hover:text-lol-gold">
              About &amp; methodology
            </a>
            <a href="/privacy/" className="hover:text-lol-gold">
              Privacy
            </a>
            <a
              href="https://github.com/MyNamesEMurray/mayhem-tracker/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="hover:text-lol-gold"
            >
              Download Mayhem Tracker
            </a>
            <a
              href="https://github.com/MyNamesEMurray/mayhem-tracker"
              target="_blank"
              rel="noreferrer"
              className="hover:text-lol-gold"
            >
              GitHub
            </a>
          </nav>
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
