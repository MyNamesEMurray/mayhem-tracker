import { useEffect, useState } from "react";
import type { StatsSource } from "../components/SourceSwitch";

// The patch list for the community source. The local database only knows the
// patches this install has played, which is a subset — often an empty one on
// a fresh install — so the filters have to come from the community cache
// while that source is selected.
export function useCommunityPatches(source: StatsSource): string[] | undefined {
  const [patches, setPatches] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (source !== "community") {
      setPatches(undefined);
      return;
    }
    let alive = true;
    window.api
      .getCommunityMeta()
      .then((m) => alive && setPatches(m.patches))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [source]);

  return patches;
}
