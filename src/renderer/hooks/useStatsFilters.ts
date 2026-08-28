import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QUEUE_ID_MAYHEM } from "../../shared/queues";
import { parsePatchParam, patchParam, type PatchSelection } from "../../shared/patch";

// App-wide default filters, matching the website: the current patch and the
// ARAM Mayhem queue.
//
// The patch default needs no lookup - "current" resolves against whatever
// patch list the page is showing, which is the community's on a community
// board and this install's own on a local one. Only the queue default has to
// be read from the database, since it degrades to All when there are no ARAM
// Mayhem games to default to.
const CURRENT_PATCH: PatchSelection = { mode: "current", from: "", to: "" };

// The board filters, held for as long as the app is open.
//
// These used to be per-page useState, which meant opening a champion and
// coming back put the tier list on the current patch again: the page
// unmounted and its state went with it, so a range chosen by hand had to be
// chosen again every single time. Switching from Champions to Augments lost
// it for the same reason. The website has never had this problem, because its
// filters live in the URL and the page holding them never unmounts.
//
// One store, the same shape as the stats-source switch beside it: setting the
// range anywhere sets it everywhere, and a page that mounts later picks up
// what is already selected.
//
// Deliberately not persisted to disk, unlike the source switch. A source is a
// preference; a patch range is about the session you are in the middle of,
// and reopening the app next week onto a range from two patches ago would be
// a filter nobody set and nobody remembers setting.
let currentPatch: PatchSelection = CURRENT_PATCH;
const patchListeners = new Set<(s: PatchSelection) => void>();

// undefined is a real value here - it means every queue - so "has the default
// been resolved yet" needs its own flag rather than a null check.
let currentQueue: number | undefined;
let queueResolved = false;
let queueRequest: Promise<void> | null = null;
const queueListeners = new Set<(q: number | undefined) => void>();

function setQueueEverywhere(next: number | undefined) {
  currentQueue = next;
  queueResolved = true;
  for (const listener of queueListeners) listener(next);
}

// Read once for the whole app rather than once per page. The default degrades
// to All when the database holds no ARAM Mayhem games, and a choice already
// made while this was in flight wins over it.
function resolveDefaultQueue(): Promise<void> {
  queueRequest ??= window.api
    .getMatchFilterOptions()
    .then((o) => {
      if (queueResolved) return;
      setQueueEverywhere(o.queues.includes(QUEUE_ID_MAYHEM) ? QUEUE_ID_MAYHEM : undefined);
    })
    .catch(() => {
      // Options unavailable: All queues is the honest fallback, and the next
      // page to mount asks again
      queueRequest = null;
    });
  return queueRequest;
}

// Shared-store variant (Champions, Augments, Match History, the in-game panel)
export function useStatsFilters() {
  const [patchSelection, setPatchState] = useState<PatchSelection>(currentPatch);
  const [queue, setQueueState] = useState<number | undefined>(currentQueue);

  useEffect(() => {
    patchListeners.add(setPatchState);
    queueListeners.add(setQueueState);
    // A page that mounted after a change catches up here
    setPatchState(currentPatch);
    setQueueState(currentQueue);
    if (!queueResolved) void resolveDefaultQueue();
    return () => {
      patchListeners.delete(setPatchState);
      queueListeners.delete(setQueueState);
    };
  }, []);

  const setPatchSelection = useCallback((next: PatchSelection) => {
    currentPatch = next;
    for (const listener of patchListeners) listener(next);
  }, []);

  const setQueue = useCallback((next: number | undefined) => setQueueEverywhere(next), []);

  return { patchSelection, setPatchSelection, queue, setQueue };
}

// URL-param variant (the champion page): filters live in the URL so a link
// carries the view and the page can widen its own range without touching the
// board's. The patch parameter uses the same grammar as the website's -
// absent for the current patch, "all", a single patch, or "A-B" - so the two
// surfaces read each other's links.
//
// This one does not write back to the store above, and that is the point. A
// champion page reaches back a patch at a time when its sample is thin; if
// that reached its way into the board's selection, coming back from a rarely
// played champion would silently widen a tier list nobody asked to widen.
export function useUrlStatsFilters(patches: string[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [defaultQueue, setDefaultQueue] = useState<number | undefined>(currentQueue);

  useEffect(() => {
    queueListeners.add(setDefaultQueue);
    setDefaultQueue(currentQueue);
    if (!queueResolved) void resolveDefaultQueue();
    return () => {
      queueListeners.delete(setDefaultQueue);
    };
  }, []);

  const rawPatch = searchParams.get("patch");
  const queueParam = searchParams.get("queue");
  const queue = queueParam === "all" ? undefined : queueParam ? Number(queueParam) : defaultQueue;

  const patchSelection = useMemo(() => parsePatchParam(rawPatch, patches), [rawPatch, patches]);

  const setParam = (key: "patch" | "queue", value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // An absent patch parameter already means the current patch, so a
        // selection that encodes to null clears it rather than writing "all"
        if (key === "patch" && value === null) next.delete("patch");
        else next.set(key, value ?? "all");
        return next;
      },
      { replace: true },
    );
  };
  const setPatchSelection = (s: PatchSelection) => setParam("patch", patchParam(s, patches));
  const setQueue = (q: number | undefined) => setParam("queue", q == null ? null : String(q));

  // Raw params for carrying the current filters to a sibling page - keeps an
  // explicit "all" explicit instead of collapsing it back to the default
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (rawPatch) params.set("patch", rawPatch);
    if (queueParam) params.set("queue", queueParam);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [rawPatch, queueParam]);

  return { patchSelection, setPatchSelection, queue, setQueue, filterQuery };
}
