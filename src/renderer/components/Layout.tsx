import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { useLiveGame } from "../hooks/useLiveGame";
import { useBackfill } from "../hooks/useBackfill";
import type { UpdateInfo } from "../lib/types";
import { recordGamesUpdated } from "../lib/eventTrace";
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

  // Always-on tally for the diagnostics panel
  useEffect(() => window.api.onGamesUpdated(recordGamesUpdated), []);

  // A game starting opens the augment panel, but only from Overview.
  //
  // The panel is worth nothing if you have to remember it exists, and the
  // moment it is worth something is the moment a game begins. Overview is
  // where the app sits when nobody has moved it, so arriving there is a
  // reasonable read of "not busy with anything else"; someone who deliberately
  // opened Matches or Settings is left where they put themselves.
  const live = useLiveGame();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const wasInGame = useRef(false);
  useEffect(() => {
    const inGame = live?.inGame === true;
    if (inGame && !wasInGame.current && pathname === "/") navigate("/live");
    wasInGame.current = inGame;
  }, [live?.inGame, pathname, navigate]);

  // Ctrl+Shift+D reveals (or hides) the developer tools in Settings. They
  // ship with every build but stay invisible to players who never ask.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== "d") return;
      e.preventDefault();
      const enabled = (await window.api.getSetting("developer_mode")) === "true";
      await window.api.setSetting("developer_mode", String(!enabled));
      setSyncMessage(enabled ? "Developer options hidden" : "Developer options shown in Settings");
      window.dispatchEvent(new CustomEvent("mayhem-developer-mode", { detail: !enabled }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    window.api.getVersion().then(setVersion);
    window.api.checkForUpdate().then(setUpdate);
    // The window can stay open for days; keep the tab-bar pill honest
    const recheck = setInterval(() => window.api.checkForUpdate().then(setUpdate), 6 * 3600_000);
    return () => clearInterval(recheck);
  }, []);

  // Settings' manual "Check for updates" found one - adopt it and open the
  // dialog (the dialog and pill live here, not in Settings)
  useEffect(() => {
    const handler = (e: Event) => {
      const info = (e as CustomEvent<UpdateInfo>).detail;
      setUpdate(info);
      setShowUpdateDialog(true);
    };
    window.addEventListener("mayhem-update-available", handler);
    return () => window.removeEventListener("mayhem-update-available", handler);
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
      <main className="flex-1 overflow-y-auto scroll-stable p-5">
        <Outlet />
      </main>
      {showUpdateDialog && update && (
        <UpdateDialog update={update} onClose={() => setShowUpdateDialog(false)} />
      )}
      <OnboardingWizard />
    </div>
  );
}
