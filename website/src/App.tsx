import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAugmentTotals,
  fetchChampionAugments,
  fetchChampionItems,
  fetchChampionPurchases,
  fetchChampionStats,
  fetchPatchSpans,
  type AugmentStatRow,
  type AugmentTotalRow,
  type ChampionStatRow,
  type ItemPurchaseRow,
  type ItemStatRow,
} from "./lib/api";
import { GameDataProvider, NO_AUGMENTS } from "../../src/shared/ui/GameData.tsx";
import { DownloadIcon, InfoIcon, SwordsIcon } from "../../src/shared/ui/icons.tsx";
import { Button, PANEL, buttonClass } from "../../src/shared/ui/primitives.tsx";
import {
  loadAugmentData,
  loadChampionData,
  type AugmentData,
  type ChampionData,
} from "./lib/dragon";
import {
  aggregateChampions,
  comparePatches,
  availableQueues,
  formatPatch,
  MIN_SAMPLE,
  parsePatchParam,
  // The local `patchParam` here is the raw URL string; this is the function
  // that produces one from a selection
  patchParam as encodePatchParam,
  patchesIn,
  MAYHEM_QUEUE_IDS,
  QUEUE_LABELS,
  type Filters,
} from "./lib/stats";
import AdSlot from "./components/AdSlot";
import CommunityPage from "./components/CommunityPage";
import AugmentsTable from "./components/AugmentsTable";
import ChampionDetail from "./components/ChampionDetail";
import ChampionsTable from "./components/ChampionsTable";
import PatchRangeSelect from "../../src/shared/ui/PatchRangeSelect";
import QueueSelect from "../../src/shared/ui/QueueSelect";
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
// default view is that patch alone - so the tier list a first-time visitor
// lands on is its emptiest. When the newest patch can't support the view,
// reach back a patch at a time until it can, then say so and leave the
// widened range in the filter for the reader to override.
const AUTO_WIDEN_MIN_GAMES = 50;
// Champion pages get the site's own confidence floor: below this a win rate
// renders muted everywhere else, so it shouldn't headline a build page
const AUTO_WIDEN_MIN_CHAMPION_GAMES = MIN_SAMPLE;
// Never reach back further than this - old patches are a different mode
const AUTO_WIDEN_MAX_PATCHES = 3;

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which patches exist, and which of them have been fetched. The second is
  // what stops a widened range refetching rows already in memory.
  const [patchList, setPatchList] = useState<string[]>([]);
  const [loadedPatches, setLoadedPatches] = useState<Set<string>>(() => new Set());
  const [loadingMore, setLoadingMore] = useState(false);
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
  // the bundle has data - a crawler, or a slow connection. It goes as soon as
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

  // Loading runs in stages, because the board only ever renders a few patches
  // and used to download all of them to do it.
  //
  //   1. the patch list, which is 21 rows and tells the picker what exists
  //   2. the newest patch, which is what the default view shows -> paint
  //   3. the next two, because AUTO_WIDEN_MAX_PATCHES never reaches further
  //   4. anything else, only when a range or "All patches" asks for it
  //
  // Stage 2 is 12 KB gzipped where the old single fetch was 237 KB. Stage 3
  // arrives behind it and only feeds the widening banner, which is a
  // progressive enhancement rather than the primary render, so its latency is
  // not felt as a spinner.
  useEffect(() => {
    let active = true;
    setError(null);

    (async () => {
      const spans = await fetchPatchSpans();
      if (!active) return;
      const newest = spans.map((s) => s.patch).sort((a, b) => comparePatches(b, a));
      setPatchList(newest);

      const first = newest.slice(0, 1);
      const [championRows, augmentRows, championData, augmentData] = await Promise.all([
        fetchChampionStats(first),
        fetchAugmentTotals(first),
        loadChampionData(),
        loadAugmentData(),
      ]);
      if (!active) return;
      setData({ championRows, augmentRows, championData, augmentData });
      setLoadedPatches(new Set(first));

      // Everything auto-widen can reach, so the banner never waits on a fetch
      const widenReach = newest.slice(0, AUTO_WIDEN_MAX_PATCHES);
      if (widenReach.length > first.length) {
        const rest = widenReach.slice(first.length);
        const [moreChamps, moreAugs] = await Promise.all([
          fetchChampionStats(rest),
          fetchAugmentTotals(rest),
        ]);
        if (!active) return;
        setData((d) =>
          d
            ? {
                ...d,
                championRows: [...d.championRows, ...moreChamps],
                augmentRows: [...d.augmentRows, ...moreAugs],
              }
            : d,
        );
        setLoadedPatches((prev) => new Set([...prev, ...widenReach]));
      }
    })().catch((err) => {
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

  // From community_patch_spans (21 rows) rather than from the stat rows,
  // because the stat rows are no longer every patch: deriving the picker's
  // options from them would hide every patch not yet fetched.
  const patches = useMemo(() => [...patchList].sort((a, b) => comparePatches(b, a)), [patchList]);

  // Stage 4: a selection reaching past what is loaded fetches the difference
  // once and keeps it. Widening a range twice does not refetch the overlap.
  useEffect(() => {
    if (!data || patchList.length === 0) return;
    const wanted = patchesIn(parsePatchParam(patchParam, patches), patches) ?? patches;
    const missing = wanted.filter((p) => !loadedPatches.has(p));
    if (missing.length === 0) return;

    let active = true;
    setLoadingMore(true);
    Promise.all([fetchChampionStats(missing), fetchAugmentTotals(missing)])
      .then(([moreChamps, moreAugs]) => {
        if (!active) return;
        setData((d) =>
          d
            ? {
                ...d,
                championRows: [...d.championRows, ...moreChamps],
                augmentRows: [...d.augmentRows, ...moreAugs],
              }
            : d,
        );
        setLoadedPatches((prev) => new Set([...prev, ...missing]));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoadingMore(false);
      });
    return () => {
      active = false;
    };
  }, [patchParam, patches, patchList, data, loadedPatches]);

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

  // The heading names the queue being shown, so "46,408 games" reads as this
  // patch of this queue rather than the size of the whole database
  // queue is undefined both for "all queues" and for a default that has no
  // data, so the label reads the parameter rather than the resolved value
  const queueLabel =
    queueParam === "all"
      ? "All Queues"
      : queue == null
        ? QUEUE_LABELS[DEFAULT_QUEUE]
        : (QUEUE_LABELS[queue] ?? `Queue ${queue}`);

  // What the picker shows, which is not always what the tables filter on: the
  // first rows have not landed on the very first paint, so `queues` is empty
  // and `queue` resolves to undefined. Reading the parameter the way the
  // label does keeps the control showing the default instead of blinking out
  // of the header and back in a beat later.
  const queueOptions = queues.length > 0 ? queues : MAYHEM_QUEUE_IDS;
  const selectedQueue = queueParam === "all" ? undefined : (queue ?? DEFAULT_QUEUE);

  // Default view is the current patch; ?patch= also supports "all", a single
  // patch, or an inclusive "A-B" range
  const patchSet = useMemo(() => {
    const included = patchesIn(parsePatchParam(patchParam, patches), patches);
    // Undefined means every patch; the row filter reads that as no filtering
    return included && new Set(included);
  }, [patchParam, patches]);
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
      // False when even the full reach-back fell short - the banner says so
      // rather than claiming the numbers are now solid
      reached: count >= target,
    };
  }, [data, patches, selectedChampion, gamesOn]);

  // A champion page's patch selection is scoped to that page: whatever the
  // board was showing is restored on the way back out. Widening for one thin
  // champion shouldn't quietly change what the tier list shows afterwards -
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
  // the very next render - so the range moved with nothing explaining why.
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

  // The low-sample floor used to be a toggle. With tens of thousands of games
  // a patch, nearly everything clears it, and the * on a thin row already says
  // what the toggle said. Champion pages still pass MIN_SAMPLE to their build
  // lists, where a handful of picks genuinely can mislead.

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
          ? "text-lol-gold-light shadow-[inset_0_-2px_0_var(--color-lol-gold)]"
          : "text-lol-text hover:text-lol-gold-light"
      }`}
    >
      {label}
    </button>
  );

  return (
    // Augment names and rarities, loaded once here so the shared icon reads
    // them from context rather than every caller passing them down
    <GameDataProvider augments={data?.augmentData ?? NO_AUGMENTS}>
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
              <SwordsIcon width={20} height={20} className="text-lol-gold" />
              <span>
                MAYHEM<span className="text-lol-gold">STATS</span>
              </span>
            </a>
            {/* Pinned to the logo row rather than the filter group: there it
              claimed a whole extra row once the filters wrapped */}
            <a
              href="/download/"
              title="Download the MayhemStats Tracker desktop app - play, track, and contribute your games"
              className={buttonClass(
                "gold",
                "md",
                "ml-auto min-[1081px]:order-last whitespace-nowrap",
              )}
            >
              <DownloadIcon width={14} height={14} />
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
              series - neither takes a patch or a queue - so the filters sat
              there doing nothing. Hidden rather than disabled: a control that
              can't change anything shouldn't ask to be tried. */}
            {!onCommunityPage && (
              <div className="flex items-center gap-2 py-2 max-[1080px]:w-full max-[1080px]:pt-0 max-[1080px]:pb-2.5 max-[1080px]:flex-wrap">
                <QueueSelect
                  queues={queueOptions}
                  value={selectedQueue}
                  onChange={(q) =>
                    // The default queue is the empty parameter, so choosing it
                    // takes ?queue= back out of the URL rather than spelling
                    // out what no parameter already means.
                    setParam(
                      "queue",
                      q === undefined ? "all" : q === DEFAULT_QUEUE ? null : String(q),
                    )
                  }
                  size="sm"
                />
                <PatchRangeSelect
                  patches={patches}
                  selection={parsePatchParam(patchParam, patches)}
                  onChange={(next) => setParam("patch", encodePatchParam(next, patches))}
                />
              </div>
            )}
          </div>
        </header>

        <div className="max-w-[1120px] min-[1500px]:max-w-[1320px] mx-auto px-6 pt-7 pb-14">
          {error && (
            <div className="bg-lol-card border border-lol-loss/40 rounded-xl p-5 text-sm">
              <p className="text-lol-loss mb-2">Couldn't load community stats: {error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {autoWiden && !onCommunityPage && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-lol-gold/25 bg-lol-gold/[0.06] px-4 py-3">
              <InfoIcon
                width={15}
                height={15}
                className="mt-[3px] shrink-0 text-lol-gold"
                aria-hidden="true"
              />
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
                  ` Still thin at ${autoWiden.widened.toLocaleString()} - read as directional.`}
              </p>
            </div>
          )}

          {onCommunityPage && <CommunityPage />}

          {!error && !data && !onCommunityPage && (
            <div className="text-center text-lol-text py-20">Loading community stats...</div>
          )}

          {data && onChampionPage && selectedChampion == null && (
            <div className="space-y-4">
              <button
                onClick={() => navigate("/")}
                className="text-sm text-lol-gold hover:underline"
              >
                ← All champions
              </button>
              <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
                No champion found at this address.
              </div>
            </div>
          )}

          {data && onChampionPage && selectedChampion != null && championRowsError && (
            <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
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
                  {queueLabel} {tab === "champions" ? "Champions" : "Augments"} Tier List
                </h1>
                <span className="text-xs">
                  {patchLabel} · {totalGames.toLocaleString()} games
                  {loadingMore && (
                    // A widened range fetches the patches it added. Saying so
                    // beats letting the count climb with no explanation.
                    <span className="text-lol-text/70"> · loading older patches…</span>
                  )}
                </span>
              </div>
              <p className="text-[13px] mb-4">
                {tab === "champions"
                  ? "Every champion ranked by score."
                  : "Augments ranked within their rarity."}
              </p>

              <AdSlot slot={AD_SLOTS.top} />

              {tab === "augments" ? (
                <AugmentsTable
                  rows={data.augmentRows}
                  filters={filters}
                  totalSlots={totalSlots}
                  augmentData={data.augmentData}
                  championData={data.championData}
                  onSelectChampion={openChampion}
                />
              ) : (
                <ChampionsTable
                  rows={data.championRows}
                  filters={filters}
                  totalSlots={totalSlots}
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
              players who opted in. Contributions contain champions, augments, items, and combat
              stats only - never summoner names, Riot IDs, or anything that identifies a player.
              Want your games counted? Install the tracker and flip on{" "}
              <span className="text-lol-text">Settings → Community Stats</span>.
            </p>
            <p>
              MayhemStats isn't endorsed by Riot Games and doesn't reflect the views or opinions of
              Riot Games or anyone officially involved in producing or managing League of Legends.
              League of Legends and Riot Games are trademarks or registered trademarks of Riot
              Games, Inc.
            </p>
          </footer>
        </div>
      </div>
    </GameDataProvider>
  );
}
