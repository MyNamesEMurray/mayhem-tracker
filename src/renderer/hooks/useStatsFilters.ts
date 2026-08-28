import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QUEUE_ID_MAYHEM } from "../../shared/queues";
import { parsePatchParam, patchParam, type PatchSelection } from "../../shared/patch";

// App-wide default filters, matching the website: the current patch and the
// ARAM Mayhem queue.
//
// The patch default needs no lookup — "current" resolves against whatever
// patch list the page is showing, which is the community's on a community
// board and this install's own on a local one. Only the queue default has to
// be read from the database, since it degrades to All when there are no ARAM
// Mayhem games to default to.
const CURRENT_PATCH: PatchSelection = { mode: "current", from: "", to: "" };

// Local-state variant (Champions, Augments, Match History)
export function useStatsFilters() {
  const [patchSelection, setPatchSelection] = useState<PatchSelection>(CURRENT_PATCH);
  const [queue, setQueue] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    window.api.getMatchFilterOptions().then((o) => {
      if (cancelled) return;
      // Keep anything the user already picked while options were loading
      setQueue((cur) => cur ?? (o.queues.includes(QUEUE_ID_MAYHEM) ? QUEUE_ID_MAYHEM : undefined));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { patchSelection, setPatchSelection, queue, setQueue };
}

// URL-param variant (the champion page): filters live in the URL so back links
// restore the same view, and a range can be linked to. The patch parameter
// uses the same grammar as the website's — absent for the current patch,
// "all", a single patch, or "A-B" — so the two surfaces read each other's
// links.
export function useUrlStatsFilters(patches: string[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [defaultQueue, setDefaultQueue] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    window.api.getMatchFilterOptions().then((o) => {
      if (!cancelled) {
        setDefaultQueue(o.queues.includes(QUEUE_ID_MAYHEM) ? QUEUE_ID_MAYHEM : undefined);
      }
    });
    return () => {
      cancelled = true;
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

  // Raw params for carrying the current filters to a sibling page — keeps an
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
