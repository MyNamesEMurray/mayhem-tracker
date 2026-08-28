import { useEffect, useState } from "react";
import type { StatsSource } from "../components/SourceSwitch";

// The patches the filter can offer, newest first, for whichever source is
// showing. The community cache knows every patch anyone has contributed; the
// local database knows only the ones this install has played, which is a
// subset and often an empty one on a fresh install. Picking the wrong list
// offers patches with no rows behind them, or hides ones that have rows.
//
// This used to live inside the old single-patch dropdown, which fetched the
// local list itself and took the community one as a prop. The range picker is
// shared with the website and holds no state, so the list is the page's to
// supply — and the page is where the source is known anyway.
export function usePatchOptions(source: StatsSource): string[] {
  const [patches, setPatches] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      (source === "community"
        ? window.api.getCommunityMeta().then((m) => m.patches)
        : window.api.getMatchFilterOptions().then((o) => o.patches)
      )
        .then((list) => alive && setPatches(list))
        .catch(() => {});
    load();
    // A game finishing adds a patch to the local list; the community list is
    // refetched on the same signal because an upload can widen it too
    const unsub = window.api.onGamesUpdated(load);
    return () => {
      alive = false;
      unsub();
    };
  }, [source]);

  return patches;
}
