import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAugmentTotals,
  fetchChampionAugments,
  fetchChampionItems,
  fetchChampionPurchases,
  fetchChampionStats,
  type AugmentStatRow,
  type AugmentTotalRow,
  type ChampionStatRow,
  type ItemPurchaseRow,
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
  formatPatch,
  MIN_SAMPLE,
  QUEUE_LABELS,
  type Filters,
} from "./lib/stats";
import AdSlot from "./components/AdSlot";
import CommunityPage from "./components/CommunityPage";
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

// What every page needs, and only that. The per-champion item and augment
// grains are ~580k rows between them and grow with every contributed game;
// pulling them up front meant six hundred paged requests before anything drew.
// They load per champion instead, from the champion page that wants them.
interface LoadedData {
  championRows: ChampionStatRow[];
  augmentRows: AugmentTotalRow[];
  championData: ChampionData;
  augmentData: AugmentData;
}

// The rows behind one champion page
interface ChampionRows {
  championId: number;
  augmentRows: AugmentStatRow[];
  itemRows: ItemStatRow[];
  purchaseRows: ItemPurchaseRow[];
}

// A fresh patch has almost nothing in it for the first day or two, and the
// default view is that patch alone — so the tier list a first-time visitor
// lands on is its emptiest. When the newest patch can't support the view,
// reach back a patch at a time until it can, then say so and leave the
// widened range in the filter for the reader to override.
const AUTO_WIDEN_MIN_GAMES = 50;
// Champion pages get the site's own confidence floor: below this a win rate
// renders muted everywhere else, so it shouldn't headline a build page
const AUTO_WIDEN_MIN_CHAMPION_GAMES = MIN_SAMPLE;
// Never reach back further than this — old patches are a different mode
const AUTO_WIDEN_MAX_PATCHES = 3;

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
  const onCommunityPage = /^\/community\/?$/.test(path);

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

  // The prerendered static block is a fallback for readers who arrive before
  // the bundle has data — a crawler, or a slow connection. It goes as soon as
  // React has something to show in its place: live data, an error message, or
  // the community page, which loads its own totals and never waits on `data`.
  // Tying it to `data` alone meant an API failure left the static block
  // stranded under the live page, reading as a duplicate footer on every page.
  useEffect(() => {
    if (data || error || onCommunityPage) document.getElementById("prerender")?.remove();
  }, [data, error, onCommunityPage]);

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
    Promise.all([fetchChampionStats(), fetchAugmentTotals(), loadChampionData(), loadAugmentData()])
      .then(([championRows, augmentRows, championData, augmentData]) => {
        if (active) setData({ championRows, augmentRows, championData, augmentData });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  // A champion page's own rows. Fetched when the page opens and kept until a
  // different champion is opened, so going back to the tier list and returning
  // doesn't refetch.
  const [championRows, setChampionRows] = useState<ChampionRows | null>(null);
  const [championRowsError, setChampionRowsError] = useState<string | null>(null);
  useEffect(() => {
    if (selectedChampion == null) return;
    if (championRows?.championId === selectedChampion) return;
    let active = true;
    setChampionRowsError(null);
    Promise.all([
      fetchChampionAugments(selectedChampion),
      fetchChampionItems(selectedChampion),
      fetchChampionPurchases(selectedChampion),
    ])
      .then(([augmentRows, itemRows, purchaseRows]) => {
        if (active)
          setChampionRows({
            championId: selectedChampion,
            augmentRows,
            itemRows,
            purchaseRows,
          });
      })
      .catch((err) => {
        if (active) setChampionRowsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [selectedChampion, championRows]);

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

  // Games available on a set of patches, for the whole board or one champion
  const gamesOn = useCallback(
    (included: Set<string>, championId: number | null) => {
      if (!data) return 0;
      let slots = 0;
      for (const r of data.championRows) {
        if (!included.has(r.patch)) continue;
        if (queue != null && r.queue_id !== queue) continue;
        if (championId != null && r.champion_id !== championId) continue;
        slots += r.games;
      }
      // Champion rows are per participant slot; ten of them make a game
      return championId != null ? slots : Math.round(slots / 10);
    },
    [data, queue],
  );

  // How far back the newest patch has to reach to be worth reading
  const autoWidenTo = useMemo(() => {
    if (!data || patches.length < 2) return null;
    const target = selectedChampion != null ? AUTO_WIDEN_MIN_CHAMPION_GAMES : AUTO_WIDEN_MIN_GAMES;
    const included = new Set<string>();
    let count = 0;
    for (const patch of patches.slice(0, AUTO_WIDEN_MAX_PATCHES)) {
      included.add(patch);
      count = gamesOn(included, selectedChampion);
      if (count >= target) break;
    }
    if (included.size < 2) return null;
    const oldest = patches[included.size - 1];
    return {
      from: oldest,
      to: patches[0],
      onLatest: gamesOn(new Set([patches[0]]), selectedChampion),
      widened: count,
      // False when even the full reach-back fell short — the banner says so
      // rather than claiming the numbers are now solid
      reached: count >= target,
    };
  }, [data, patches, selectedChampion, gamesOn]);

  // A champion page's patch selection is scoped to that page: whatever the
  // board was showing is restored on the way back out. Widening for one thin
  // champion shouldn't quietly change what the tier list shows afterwards —
  // and neither should a range the reader picked while looking at that
  // champion, since they chose it to read one page, not to change the site.
  const boardPatch = useRef<string | null>(null);
  const wasOnChampion = useRef(false);
  const lastChampion = useRef<number | null>(null);

  // Applied once per champion (and once for the board), so choosing "current
  // patch" afterwards isn't immediately undone by this
  const widenedFor = useRef<string | null>(null);
  // The range this widened to. Without it the effect below sees the param it
  // just wrote, reads it as the reader's own choice, and clears the banner on
  // the very next render — so the range moved with nothing explaining why.
  const appliedParam = useRef<string | null>(null);
  const [autoWiden, setAutoWiden] = useState<typeof autoWidenTo>(null);
  useEffect(() => {
    const key = `${selectedChampion ?? "board"}:${queue ?? "all"}`;
    if (patchParam != null) {
      // Anything other than the range we set is the reader overriding it
      if (patchParam !== appliedParam.current && autoWiden) setAutoWiden(null);
      return;
    }
    if (widenedFor.current === key || !autoWidenTo) return;
    const range = `${autoWidenTo.from}-${autoWidenTo.to}`;
    widenedFor.current = key;
    appliedParam.current = range;
    setAutoWiden(autoWidenTo);
    setParam("patch", range);
  }, [patchParam, autoWidenTo, selectedChampion, queue, setParam, autoWiden]);

  useEffect(() => {
    if (onChampionPage && !wasOnChampion.current) {
      boardPatch.current = patchParam;
    } else if (onChampionPage && selectedChampion !== lastChampion.current) {
      // Cross-linked from one champion to another: the range the last one
      // needed says nothing about this one, so start it over from the board's
      if (patchParam !== boardPatch.current) setParam("patch", boardPatch.current);
      widenedFor.current = null;
      appliedParam.current = null;
      setAutoWiden(null);
    } else if (!onChampionPage && wasOnChampion.current) {
      if (patchParam !== boardPatch.current) setParam("patch", boardPatch.current);
      // Let the next champion page widen from scratch
      widenedFor.current = null;
      appliedParam.current = null;
      setAutoWiden(null);
    }
    wasOnChampion.current = onChampionPage;
    lastChampion.current = onChampionPage ? selectedChampion : null;
  }, [onChampionPage, selectedChampion, patchParam, setParam]);
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
      ? `Patch ${formatPatch(patches[0])}`
      : ""
    : patchParam === "all"
      ? "All patches"
      : patchParam.includes("-")
        ? `Patches ${patchParam.split("-").map(formatPatch).join("–")}`
        : `Patch ${formatPatch(patchParam)}`;

  const navTab = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`flex items-center px-3.5 max-[360px]:px-2 text-[13px] font-semibold transition-colors ${
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
        {/* Wraps at every width: logo + nav + the whole filter group only fit
            one row above ~1080px, and forcing nowrap below that pushed the
            filters off the right edge instead of onto a second line. */}
        <div className="max-w-[1120px] min-[1500px]:max-w-[1320px] mx-auto px-6 flex items-center gap-6 flex-wrap">
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
          {/* Pinned to the logo row rather than the filter group: there it
              claimed a whole extra row once the filters wrapped */}
          <a
            href="/download/"
            title="Download the MayhemStats Tracker desktop app — play, track, and contribute your games"
            className="ml-auto min-[1081px]:order-last flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-lol-gold/50 bg-lol-gold/15 text-lol-gold text-[13px] font-semibold whitespace-nowrap transition-colors hover:bg-lol-gold/25"
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
            <span className="max-[380px]:hidden">Download app</span>
            <span className="min-[381px]:hidden">App</span>
          </a>
          {/* The nav takes the slack instead of the filter group using ml-auto:
              that right-aligns the filters while they share the top row, but
              leaves them left-aligned with everything else once they wrap. */}
          <nav className="flex gap-1 self-stretch min-[1081px]:flex-1">
            {navTab(
              "Champions",
              !onCommunityPage && (tab === "champions" || onChampionPage),
              () => {
                if (onChampionPage || onCommunityPage) navigate("/");
                setParam("tab", null);
              },
            )}
            {navTab("Augments", !onCommunityPage && tab === "augments" && !onChampionPage, () => {
              if (onChampionPage || onCommunityPage) navigate("/");
              setParam("tab", "augments");
            })}
            {navTab("Community", onCommunityPage, () => {
              if (!onCommunityPage) navigate("/community/");
            })}
          </nav>
          {/* The Community page reads its own totals and its own per-day
              series — neither takes a patch or a queue — so the filters sat
              there doing nothing. Hidden rather than disabled: a control that
              can't change anything shouldn't ask to be tried. */}
          {!onCommunityPage && (
            <div className="flex items-center gap-2 py-2 max-[1080px]:w-full max-[1080px]:pt-0 max-[1080px]:pb-2.5 max-[1080px]:flex-wrap">
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
            </div>
          )}
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

        {autoWiden && !onCommunityPage && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-lol-gold/25 bg-lol-gold/[0.06] px-4 py-3">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c89b3c"
              strokeWidth="2"
              strokeLinecap="round"
              className="mt-[3px] shrink-0"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
            <p className="text-[13px] leading-relaxed text-lol-text">
              <span className="text-lol-text-bright">
                Showing {formatPatch(autoWiden.from)}–{formatPatch(autoWiden.to)}.
              </span>{" "}
              {formatPatch(autoWiden.to)} alone has{" "}
              {autoWiden.onLatest === 0
                ? "no games"
                : `${autoWiden.onLatest} game${autoWiden.onLatest === 1 ? "" : "s"}`}{" "}
              {selectedChampion != null ? "on this champion" : "so far"}.
              {!autoWiden.reached &&
                ` Still thin at ${autoWiden.widened.toLocaleString()} — read as directional.`}
            </p>
          </div>
        )}

        {onCommunityPage && <CommunityPage />}

        {!error && !data && !onCommunityPage && (
          <div className="text-center text-lol-text py-20">Loading community stats...</div>
        )}

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

        {data && onChampionPage && selectedChampion != null && championRowsError && (
          <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-sm text-lol-text">
            Could not load this champion's builds. {championRowsError}
          </div>
        )}

        {data &&
          onChampionPage &&
          selectedChampion != null &&
          !championRowsError &&
          championRows?.championId !== selectedChampion && (
            <div className="text-center text-lol-text py-20">Loading builds...</div>
          )}

        {data &&
          onChampionPage &&
          selectedChampion != null &&
          championRows?.championId === selectedChampion && (
            <>
              <ChampionDetail
                championId={selectedChampion}
                championRows={data.championRows}
                augmentRows={championRows.augmentRows}
                itemRows={championRows.itemRows}
                purchaseRows={championRows.purchaseRows}
                filters={filters}
                minGames={minGames}
                championData={data.championData}
                augmentData={data.augmentData}
                onBack={() => navigate("/")}
              />
            </>
          )}

        {data && !onChampionPage && !onCommunityPage && (
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
            <a href="/guide/" className="hover:text-lol-gold">
              ARAM Mayhem guide
            </a>
            <a href="/about/" className="hover:text-lol-gold">
              About &amp; methodology
            </a>
            <a
              href="/community/"
              onClick={(e) => {
                e.preventDefault();
                navigate("/community/");
              }}
              className="hover:text-lol-gold"
            >
              Community impact
            </a>
            <a href="/privacy/" className="hover:text-lol-gold">
              Privacy
            </a>
            <a href="/download/" className="hover:text-lol-gold">
              Download MayhemStats Tracker
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
              MayhemStats Tracker
            </a>{" "}
            players who opted in. Contributions contain champions, augments, items, and combat stats
            only — never summoner names, Riot IDs, or anything that identifies a player. Want your
            games counted? Install the tracker and flip on{" "}
            <span className="text-lol-text">Settings → Community Stats</span>.
          </p>
          <p>
            MayhemStats isn't endorsed by Riot Games and doesn't reflect the views or opinions of
            Riot Games or anyone officially involved in producing or managing League of Legends.
            League of Legends and Riot Games are trademarks or registered trademarks of Riot Games,
            Inc.
          </p>
        </footer>
      </div>
    </div>
  );
}
