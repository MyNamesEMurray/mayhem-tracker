import { useState, useEffect, useCallback } from "react";

export default function Settings() {
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [hideClassic, setHideClassic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [repairStatus, setRepairStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getSetting("minimize_to_tray"),
      window.api.getSetting("hide_classic_games"),
    ]).then(([tray, classic]) => {
      setMinimizeToTray(tray !== "false");
      setHideClassic(classic === "true");
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
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-lol-text-bright">Settings</h1>

      {/* Exit Behavior */}
      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-4">Exit Behavior</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-lol-text-bright">Minimize to tray on close</p>
            <p className="text-xs text-lol-text mt-0.5">
              When enabled, the program can keep storing your games even when the window is closed.
              You can still close the program from the system tray.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={minimizeToTray}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              minimizeToTray ? "bg-lol-gold" : "bg-lol-border"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                minimizeToTray ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-4">Stats</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-lol-text-bright">Hide ARAM Mayhem Classic games</p>
            <p className="text-xs text-lol-text mt-0.5">
              Exclude games from the limited-time Mayhem Classic queue from all stats and match
              history. Games are still recorded either way.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hideClassic}
            onClick={handleHideClassicToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              hideClassic ? "bg-lol-gold" : "bg-lol-border"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                hideClassic ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <h2 className="text-sm font-semibold text-lol-text-bright mb-4">Data Management</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Export data</p>
              <p className="text-xs text-lol-text mt-0.5">
                Save all match data to a JSON file for backup
              </p>
            </div>
            <button
              onClick={handleExport}
              className="px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors"
            >
              Export
            </button>
          </div>
          {exportStatus && <p className="text-xs text-lol-text">{exportStatus}</p>}

          <div className="border-t border-lol-border" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Import data</p>
              <p className="text-xs text-lol-text mt-0.5">
                Load match data from a previously exported file
              </p>
            </div>
            <button
              onClick={handleImport}
              className="px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors"
            >
              Import
            </button>
          </div>
          {importStatus && <p className="text-xs text-lol-text">{importStatus}</p>}

          <div className="border-t border-lol-border" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-lol-text-bright">Repair account data</p>
              <p className="text-xs text-lol-text mt-0.5">
                Re-detect which accounts are yours by analyzing game history, then rebuild stored
                stats, augments, and performance scores from the raw game data. Use this if games
                are attributed to the wrong account or scores look stale.
              </p>
            </div>
            <button
              onClick={handleRepair}
              className="px-4 py-1.5 rounded text-sm bg-lol-gold/20 text-lol-gold hover:bg-lol-gold/30 transition-colors"
            >
              Repair
            </button>
          </div>
          {repairStatus && <p className="text-xs text-lol-text">{repairStatus}</p>}
        </div>
      </div>
    </div>
  );
}
