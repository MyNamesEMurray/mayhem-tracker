import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { useBackfill } from "../hooks/useBackfill";
import type { UpdateInfo } from "../lib/types";
import TitleBar from "./TitleBar";
import TabBar from "./TabBar";
import UpdateDialog from "./UpdateDialog";
import OnboardingWizard from "./OnboardingWizard";

export default function Layout() {
  const status = useLcuStatus();
  const { running: backfilling, progress, percent } = useBackfill();
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    window.api.getVersion().then(setVersion);
    window.api.checkForUpdate().then(setUpdate);
  }, []);

  useEffect(() => {
    if (!syncMessage) return;
    const timer = setTimeout(() => setSyncMessage(null), 10_000);
    return () => clearTimeout(timer);
  }, [syncMessage]);

  // Background history imports can start on their own; surface their outcome
  // in the chrome so it shows no matter which tab is open.
  useEffect(
    () =>
      window.api.onBackfillDone((result) => {
        if ("error" in result) {
          setSyncMessage(`Import failed: ${result.error}`);
        } else if (result.cancelled) {
          setSyncMessage(`Import stopped after ${result.added} game(s)`);
        } else if (result.added > 0) {
          setSyncMessage(`Imported ${result.added} past game(s)`);
        }
      }),
    [],
  );

  return (
    <div className="flex flex-col w-full h-full">
      <TitleBar version={version} />
      <TabBar status={status} update={update} onShowUpdate={() => setShowUpdateDialog(true)} />
      {(backfilling || syncMessage) && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-1.5 text-xs text-lol-text bg-lol-card/60 border-b border-lol-border/40">
          {backfilling ? (
            <>
              <span className="truncate">
                {progress && progress.total > 0
                  ? `Importing history ${progress.current}/${progress.total}`
                  : "Importing history..."}
              </span>
              <div className="w-40 h-1 rounded-sm bg-lol-border overflow-hidden">
                <div
                  className="h-full bg-lol-gold transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <button
                onClick={() => window.api.cancelBackfill()}
                className="px-2 py-0.5 rounded-md border border-lol-border bg-lol-dark text-lol-text hover:bg-lol-card-hover hover:text-lol-text-bright transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <span className="truncate" title={syncMessage ?? undefined}>
              {syncMessage}
            </span>
          )}
        </div>
      )}
      <main className="flex-1 overflow-y-auto p-5">
        <Outlet />
      </main>
      {showUpdateDialog && update && (
        <UpdateDialog update={update} onClose={() => setShowUpdateDialog(false)} />
      )}
      <OnboardingWizard />
    </div>
  );
}
