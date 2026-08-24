import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QUEUE_ID_MAYHEM } from "../../shared/queues";

// App-wide default filters, matching the website: the latest patch with
// games and the ARAM Mayhem queue. `undefined` still means "All" once the
// user picks it — the default is only seeded before any choice is made, and
// degrades to All when the database lacks the default (no games yet, or no
// ARAM Mayhem games).

type Defaults = { patch: string | undefined; queue: number | undefined };

function defaultsFrom(o: { patches: string[]; queues: number[] }): Defaults {
  return {
    // patches come back newest-first from getMatchFilterOptions
    patch: o.patches[0],
    queue: o.queues.includes(QUEUE_ID_MAYHEM) ? QUEUE_ID_MAYHEM : undefined,
  };
}

// Local-state variant (Champions, Augments, Match History)
export function useStatsFilters() {
  const [patch, setPatch] = useState<string | undefined>(undefined);
  const [queue, setQueue] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    window.api.getMatchFilterOptions().then((o) => {
      if (cancelled) return;
      const d = defaultsFrom(o);
      // Keep anything the user already picked while options were loading
      setPatch((cur) => cur ?? d.patch);
      setQueue((cur) => cur ?? d.queue);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { patch, setPatch, queue, setQueue };
}

// URL-param variant (the champion page): filters live in the URL so back
// links restore the same view. An absent param means "use
// the default"; the explicit value "all" records the user choosing All.
export function useUrlStatsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [defaults, setDefaults] = useState<Defaults | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.getMatchFilterOptions().then((o) => {
      if (!cancelled) setDefaults(defaultsFrom(o));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const patchParam = searchParams.get("patch");
  const queueParam = searchParams.get("queue");
  const patch = patchParam === "all" ? undefined : (patchParam ?? defaults?.patch);
  const queue =
    queueParam === "all" ? undefined : queueParam ? Number(queueParam) : defaults?.queue;

  const setParam = (key: "patch" | "queue", value: string | number | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value == null || value === "" ? "all" : String(value));
        return next;
      },
      { replace: true },
    );
  };
  const setPatch = (p: string | undefined) => setParam("patch", p);
  const setQueue = (q: number | undefined) => setParam("queue", q);

  // Raw params for carrying the current filters to a sibling page — keeps an
  // explicit "all" explicit instead of collapsing it back to the default
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (patchParam) params.set("patch", patchParam);
    if (queueParam) params.set("queue", queueParam);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [patchParam, queueParam]);

  return { patch, setPatch, queue, setQueue, filterQuery };
}
