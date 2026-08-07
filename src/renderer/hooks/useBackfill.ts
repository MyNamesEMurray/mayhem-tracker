import { useEffect, useState } from "react";
import type { BackfillProgress } from "../lib/types";

// Backfill can start on its own the first time an account connects, so the
// renderer has to be able to pick up a run already in flight rather than only
// tracking ones it kicked off itself.
export function useBackfill() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);

  useEffect(() => {
    window.api.isBackfillRunning().then(setRunning);

    const offProgress = window.api.onBackfillProgress((p) => {
      setRunning(true);
      setProgress(p);
    });
    const offDone = window.api.onBackfillDone(() => {
      setRunning(false);
      setProgress(null);
    });

    return () => {
      offProgress();
      offDone();
    };
  }, []);

  const percent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return { running, progress, percent };
}
