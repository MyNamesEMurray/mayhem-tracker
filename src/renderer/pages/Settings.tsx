import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useBackfill } from "../hooks/useBackfill";
import type { LiveDebugStatus, StartupStatus, UploadStatus } from "../lib/types";
import { eventTrace } from "../lib/eventTrace";
import Toggle from "../components/Toggle";

// Design-system control styles (radius 8 controls, gold primary, destructive
// secondary turns red on hover)
const BUTTON_PRIMARY =
  "px-3.5 py-1.5 text-[13px] font-semibold rounded-lg border border-lol-gold/50 bg-lol-gold/15 text-lol-gold hover:bg-lol-gold/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const BUTTON_SECONDARY =
  "px-3.5 py-1.5 text-[13px] font-semibold rounded-lg border border-lol-border bg-lol-dark text-lol-text-bright hover:bg-lol-card-hover transition-colors";
const BUTTON_DESTRUCTIVE =
  "px-3.5 py-1.5 text-[13px] font-semibold rounded-lg border border-lol-border bg-lol-dark text-lol-text-bright hover:border-lol-loss/50 hover:text-lol-loss transition-colors";

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-lol-card border border-lol-border/60 rounded-xl p-[18px]">
      <p className="text-[11px] text-lol-text uppercase tracking-[0.08em] mb-3.5">{label}</p>
      <div className="flex flex-col gap-3.5">{children}</div>
    </div>
  );
}

function SettingRow({
  name,
  description,
  children,
}: {
  name: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-lol-text-bright">{name}</div>
        <div className="text-xs text-lol-text">{description}</div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  // Shared so a backfill started automatically on first connect shows here too
  const { running: backfilling, progress } = useBackfill();
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [hideClassic, setHideClassic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [repairStatus, setRepairStatus] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getSetting("minimize_to_tray"),
      window.api.getSetting("hide_classic_games"),
      window.api.getSetting("live_tracking_enabled"),
    ]).then(([tray, classic, liveTrack]) => {
      setMinimizeToTray(tray !== "false");
      setHideClassic(classic === "true");
      setLiveTracking(liveTrack !== "false");
      setLoading(false);
    });
  }, []);

  const handleToggle = useCallback(async () => {
    const next = !minimizeToTray;
    setMinimizeToTray(next);
    await window.api.setSetting("minimize_to_tray", String(next));
  }, [minimizeToTray]);

  const handleHideClassicToggle = useCallback(async () => {
    const next = !hideClassic;
    setHideClassic(next);
    await window.api.setSetting("hide_classic_games", String(next));
  }, [hideClassic]);

  // Launch on login is stored with the OS, not in our settings table
  const [startup, setStartup] = useState<StartupStatus | null>(null);
  useEffect(() => {
    window.api.getStartupStatus().then(setStartup);
  }, []);
  const handleStartupToggle = useCallback(async () => {
    if (!startup) return;
    setStartup(await window.api.setStartupEnabled(!startup.enabled));
  }, [startup]);

  const [liveTracking, setLiveTracking] = useState(true);
  const handleLiveTrackingToggle = useCallback(async () => {
    const next = !liveTracking;
    setLiveTracking(next);
    await window.api.setSetting("live_tracking_enabled", String(next));
  }, [liveTracking]);

  useEffect(() => {
    window.api.getUploadStatus().then(setUploadStatus);
    const unsub = window.api.onUploadChanged(() => {
      window.api.getUploadStatus().then(setUploadStatus);
    });
    return unsub;
  }, []);

  const handleUploadToggle = useCallback(async () => {
    if (!uploadStatus) return;
    const next = !uploadStatus.enabled;
    setUploadStatus({ ...uploadStatus, enabled: next });
    setDeleteStatus(null);
    await window.api.setUploadEnabled(next);
    setUploadStatus(await window.api.getUploadStatus());
  }, [uploadStatus]);

  const [liveDebug, setLiveDebug] = useState<LiveDebugStatus | null>(null);

  // Poll while the page is open so the "recording" indicator tracks games
  // starting and ending
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      window.api.getLiveDebugStatus().then((s) => {
        if (alive) setLiveDebug(s);
      });
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const handleLiveDebugToggle = useCallback(async () => {
    if (!liveDebug) return;
    setLiveDebug(await window.api.setLiveDebugEnabled(!liveDebug.enabled));
  }, [liveDebug]);

  // Developer tools ship in every build but stay hidden until Ctrl+Shift+D
  const [devMode, setDevMode] = useState(false);
  useEffect(() => {
    window.api.getSetting("developer_mode").then((v) => setDevMode(v === "true"));
    const onToggle = (e: Event) => setDevMode((e as CustomEvent<boolean>).detail);
    window.addEventListener("mayhem-developer-mode", onToggle);
    return () => window.removeEventListener("mayhem-developer-mode", onToggle);
  }, []);

  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const handleDiagnostics = useCallback(async () => {
    const snap = await window.api.getDiagnostics();
    const ago = (t: number) => (t ? `${Math.round((snap.now - t) / 1000)}s ago` : "never");
    const lines = [
      `app ${snap.version} · client ${snap.lcuStatus} · live tracking ${snap.liveTracking ? "on" : "off"}${snap.hideClassic ? " · classic hidden" : ""}`,
      `last sync ${ago(snap.sync.lastSyncAt)} (${snap.sync.lastSyncSource || "?"}), found ${snap.sync.lastSyncNewGames}`,
      `end-of-game id seen: ${snap.sync.lastEogGameId || "none"}`,
      `last UI notify ${ago(snap.sync.lastNotifyAt)}; skipped with no window: ${snap.sync.notifySkippedNoWindow}`,
      `this window received ${eventTrace.gamesUpdated} update event(s), last ${ago(eventTrace.lastAt)}`,
      `uploads: ${snap.upload.uploaded} done, ${snap.upload.pending} pending${snap.upload.lastError ? ` — ${snap.upload.lastError}` : ""}`,
      `stored games: ${snap.storage.totalGames} (owner ${String(snap.storage.ownerPuuid).slice(0, 8)}…)`,
      ...snap.storage.newest.map(
        (g: any) =>
          `  ${g.game_id} q${g.queue_id} ${g.patch} started ${ago(g.created)} · list:${g.inHistory ? "yes" : "NO"} parts:${g.hasParticipants ? "yes" : "NO"} upload:${g.uploaded ?? "pending"}`,
      ),
    ];
    setDiagnostics(lines.join("\n"));
  }, []);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<string | null>(null);

  const handleCheckUpdates = useCallback(async () => {
    setCheckingUpdate(true);
    setUpdateCheckStatus(null);
    try {
      const info = await window.api.checkForUpdate();
      if (info.error) {
        setUpdateCheckStatus(`Check failed: ${info.error}`);
      } else if (info.hasUpdate) {
        setUpdateCheckStatus(`Version ${info.latest} is available`);
        // The update dialog lives in the layout chrome
        window.dispatchEvent(new CustomEvent("mayhem-update-available", { detail: info }));
      } else {
        setUpdateCheckStatus(`You're on the latest version (${info.current})`);
      }
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  const handleDeleteContributions = useCallback(async () => {
    if (
      !window.confirm(
        "Remove every game this install has contributed from the community database? " +
          "Games also contributed by other players stay, without your contribution record.",
      )
    ) {
      return;
    }
    setDeleteStatus("Deleting...");
    const result = await window.api.deleteContributions();
    if (result.success) {
      setDeleteStatus(`Deleted ${result.removedMatches ?? 0} game(s) from the community database`);
    } else {
      setDeleteStatus(`Error: ${result.error}`);
    }
    setUploadStatus(await window.api.getUploadStatus());
  }, []);

  const handleExport = useCallback(async () => {
    setExportStatus(null);
    try {
      const result = await window.api.exportData();
      if (result.success) {
        setExportStatus(`Exported to ${result.path}`);
      } else {
        setExportStatus(null);
      }
    } catch (err: any) {
      setExportStatus(`Error: ${err.message}`);
    }
  }, []);

  const handleImport = useCallback(async () => {
    setImportStatus(null);
    try {
      const result = await window.api.importData();
      if (result.success) {
        setImportStatus(`Imported ${result.imported} new game(s)`);
      } else {
        setImportStatus(null);
      }
    } catch (err: any) {
      setImportStatus(`Error: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    if (!progress) return;
    setBackfillStatus(
      progress.total === 0
        ? "Nothing new to check"
        : `Checking game ${progress.current} of ${progress.total}, ${progress.added} added so far`,
    );
  }, [progress]);

  const handleBackfill = useCallback(async () => {
    setBackfillStatus("Fetching your match list from Riot...");
    try {
      const result = await window.api.backfillHistory();
      if ("error" in result) {
        setBackfillStatus(`Error: ${result.error}`);
      } else {
        const summary =
          result.added > 0
            ? `Added ${result.added} game(s) from ${result.scanned} found in your Riot history`
            : `No new Mayhem games found (${result.scanned} games checked)`;
        setBackfillStatus(
          result.cancelled
            ? `Stopped after adding ${result.added} game(s). Run it again to finish.`
            : result.truncated
              ? `${summary}. Stopped at the ${result.scanned}-game paging limit, so anything older was not checked.`
              : summary,
        );
      }
    } catch (err: any) {
      setBackfillStatus(`Error: ${err.message}`);
    }
  }, []);

  const handleRepair = useCallback(async () => {
    setRepairStatus(null);
    try {
      const result = await window.api.repairPuuids();
      setRepairStatus(
        `Repaired ${result.repairedGames} game(s), found ${result.discoveredAccounts} account(s), rebuilt stats and scores for ${result.rebuiltGames} game(s)`,
      );
    } catch (err: any) {
      setRepairStatus(`Error: ${err.message}`);
    }
  }, []);

  if (loading) return null;

  return (
    <div className="max-w-[1400px] grid min-[861px]:grid-cols-2 gap-4 items-start">
      <div className="flex flex-col gap-4">
        <Panel label="General">
          <SettingRow
            name="Minimize to tray on close"
            description="Keep recording games from the system tray when the window is closed"
          >
            <Toggle checked={minimizeToTray} onChange={handleToggle} />
          </SettingRow>
          <SettingRow
            name="Hide ARAM Mayhem Classic games"
            description="Exclude the limited-time Classic queue from all stats and match history"
          >
            <Toggle checked={hideClassic} onChange={handleHideClassicToggle} />
          </SettingRow>
          <SettingRow
            name="Start with Windows"
            description={
              startup?.supported === false
                ? "Available in the installed and portable builds — not when running from source"
                : "Launch MayhemStats Tracker to the tray when you sign in, so games are recorded without opening it first"
            }
          >
            <Toggle
              checked={startup?.enabled ?? false}
              onChange={handleStartupToggle}
              disabled={!startup?.supported}
            />
          </SettingRow>
          <SettingRow
            name="Track build orders during games"
            description="While you play, records the order every player buys items in (locally, from the game's own live data) and shows it in match details"
          >
            <Toggle checked={liveTracking} onChange={handleLiveTrackingToggle} />
          </SettingRow>
          <SettingRow
            name="Check for updates"
            description="Updates are checked at launch and every few hours; this checks right now"
          >
            <button
              onClick={handleCheckUpdates}
              disabled={checkingUpdate}
              className={BUTTON_SECONDARY}
            >
              {checkingUpdate ? "Checking..." : "Check now"}
            </button>
          </SettingRow>
          {updateCheckStatus && <p className="text-xs text-lol-text">{updateCheckStatus}</p>}
        </Panel>

        <Panel label="Community stats">
          <SettingRow
            name="Share match data with mayhemstats.com"
            description="Opt in to the community database behind the global augment and champion stats — only champions, augments, items, and combat stat lines are sent, nothing that identifies a player"
          >
            <Toggle
              checked={uploadStatus?.enabled ?? false}
              onChange={handleUploadToggle}
              disabled={!uploadStatus}
            />
          </SettingRow>
          {uploadStatus && uploadStatus.enabled && (
            <p className="text-xs text-lol-text">
              {uploadStatus.running
                ? `Uploading... ${uploadStatus.uploaded} game(s) contributed, ${uploadStatus.pending} to go`
                : `${uploadStatus.uploaded} game(s) contributed${
                    uploadStatus.pending > 0 ? `, ${uploadStatus.pending} pending` : ""
                  }`}
              {uploadStatus.lastError ? ` — ${uploadStatus.lastError}` : ""}
            </p>
          )}
          <SettingRow
            name="Uploaded data"
            description="Remove every game this install has shared from the community database and turn off contributing"
          >
            <button onClick={handleDeleteContributions} className={BUTTON_DESTRUCTIVE}>
              Delete my data
            </button>
          </SettingRow>
          {deleteStatus && <p className="text-xs text-lol-text">{deleteStatus}</p>}
        </Panel>
      </div>

      <Panel label="Data">
        <SettingRow
          name="Backfill match history"
          description="Pull your older Mayhem games from Riot and add any that aren't stored yet — runs automatically the first time an account connects"
        >
          <button onClick={handleBackfill} disabled={backfilling} className={BUTTON_PRIMARY}>
            {backfilling ? "Working..." : "Backfill"}
          </button>
        </SettingRow>
        {backfillStatus && <p className="text-xs text-lol-text">{backfillStatus}</p>}

        <SettingRow name="Export data" description="Save all match data to a JSON file for backup">
          <button onClick={handleExport} className={BUTTON_SECONDARY}>
            Export
          </button>
        </SettingRow>
        {exportStatus && <p className="text-xs text-lol-text">{exportStatus}</p>}

        <SettingRow
          name="Import data"
          description="Load match data from a previously exported file"
        >
          <button onClick={handleImport} className={BUTTON_SECONDARY}>
            Import
          </button>
        </SettingRow>
        {importStatus && <p className="text-xs text-lol-text">{importStatus}</p>}

        <SettingRow
          name="Repair account data"
          description="Re-detect which accounts are yours from game history, then rebuild stored stats, augments, and performance scores from the raw game data"
        >
          <button onClick={handleRepair} className={BUTTON_SECONDARY}>
            Repair
          </button>
        </SettingRow>
        {repairStatus && <p className="text-xs text-lol-text">{repairStatus}</p>}
      </Panel>

      {devMode && (
        <Panel label="Developer">
          <SettingRow
            name="Sync diagnostics"
            description="What the app has actually recorded and announced — useful when games seem to be missing"
          >
            <button onClick={handleDiagnostics} className={BUTTON_SECONDARY}>
              {diagnostics ? "Refresh" : "Show"}
            </button>
          </SettingRow>
          {diagnostics && (
            <div className="space-y-2">
              <pre className="max-h-64 overflow-auto rounded-md border border-lol-border/60 bg-lol-dark/60 p-3 text-[11px] leading-relaxed text-lol-text whitespace-pre-wrap">
                {diagnostics}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(diagnostics)}
                className={BUTTON_SECONDARY}
              >
                Copy to clipboard
              </button>
            </div>
          )}
          <SettingRow
            name="Record live game data"
            description="While enabled, polls the League client's live-data API every 2 seconds during games and saves raw snapshots to local files — debug only, nothing is uploaded"
          >
            <Toggle
              checked={liveDebug?.enabled ?? false}
              onChange={handleLiveDebugToggle}
              disabled={!liveDebug}
            />
          </SettingRow>
          {liveDebug?.recording && (
            <p className="text-xs text-emerald-400">● Recording live game data…</p>
          )}
          {liveDebug?.lastFile && !liveDebug.recording && (
            <p className="text-xs text-lol-text">
              Last recording: {liveDebug.lastFile.split(/[\\/]/).pop()}
            </p>
          )}
          <SettingRow
            name="Recordings folder"
            description="Open the folder holding recorded live-game files"
          >
            <button onClick={() => window.api.openLiveDebugFolder()} className={BUTTON_SECONDARY}>
              Open folder
            </button>
          </SettingRow>
          <SettingRow
            name="Hide developer options"
            description="Tuck this panel away again — Ctrl+Shift+D brings it back"
          >
            <button
              onClick={async () => {
                await window.api.setSetting("developer_mode", "false");
                setDevMode(false);
              }}
              className={BUTTON_SECONDARY}
            >
              Hide
            </button>
          </SettingRow>
        </Panel>
      )}
    </div>
  );
}
