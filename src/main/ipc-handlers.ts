import { ipcMain, BrowserWindow, dialog, app, shell } from "electron";
import fs from "fs";
import * as db from "./db";
import * as lcu from "./lcu";
import * as dragon from "./dragon";
import * as updater from "./updater";
import * as upload from "./upload";

export function registerIpcHandlers(win: BrowserWindow) {
  ipcMain.handle(
    "db:match-history",
    (
      _event,
      limit: number,
      offset: number,
      filters?: {
        championId?: number;
        patch?: string;
        queue?: number;
        sort?: string;
        sortDir?: string;
        multikills?: string[];
      },
    ) => {
      return db.getMatchHistory(limit, offset, filters);
    },
  );

  ipcMain.handle(
    "db:match-filters",
    (_event, filters?: { championId?: number; patch?: string; queue?: number }) => {
      return db.getMatchFilterOptions(filters);
    },
  );

  ipcMain.handle("db:match-detail", (_event, gameId: number) => {
    return db.getMatchDetail(gameId);
  });

  ipcMain.handle("db:toggle-favorite", (_event, gameId: number) => {
    return db.toggleFavorite(gameId);
  });

  ipcMain.handle("db:champion-stats", (_event, patch?: string, queue?: number) => {
    return db.getChampionStatsAll(patch, queue);
  });

  ipcMain.handle(
    "db:augment-stats",
    (_event, championId?: number, patch?: string, queue?: number) => {
      return db.getAugmentStatsAll(championId, patch, queue);
    },
  );

  ipcMain.handle("db:augment-stats-detailed", (_event, patch?: string, queue?: number) => {
    return db.getAugmentStatsWithChampions(patch, queue);
  });

  ipcMain.handle("db:augment-slot-stats", (_event, patch?: string, queue?: number) => {
    return db.getAugmentSlotStats(patch, queue);
  });

  ipcMain.handle("db:augment-pair-stats", (_event, patch?: string, queue?: number) => {
    return db.getAugmentPairStats(patch, queue, 3);
  });

  ipcMain.handle(
    "db:dashboard",
    (_event, filters?: { championId?: number; patch?: string; queue?: number }) => {
      return db.getDashboardData(filters);
    },
  );

  ipcMain.handle(
    "db:champion-match-history",
    (_event, championId: number, limit: number, offset: number, patch?: string, queue?: number) => {
      return db.getChampionMatchHistory(championId, limit, offset, patch, queue);
    },
  );

  ipcMain.handle("lcu:refresh", async () => {
    // Return errors as data instead of throwing, so the renderer gets a clean
    // message rather than Electron's "Error invoking remote method" wrapper
    try {
      return await lcu.fetchNewGames(win);
    } catch (err) {
      return { error: lcu.friendlyErrorMessage(err) };
    }
  });

  ipcMain.handle("lcu:backfill", async () => {
    try {
      return await lcu.backfillHistory(win);
    } catch (err) {
      return { error: lcu.friendlyErrorMessage(err) };
    }
  });

  ipcMain.handle("lcu:cancel-backfill", () => {
    lcu.cancelBackfill();
  });

  ipcMain.handle("lcu:backfill-running", () => {
    return lcu.isBackfillRunning();
  });

  ipcMain.handle("lcu:status", () => {
    return lcu.getStatus();
  });

  ipcMain.handle("dragon:champions", async () => {
    await dragon.waitForChampionData();
    return dragon.getChampionData();
  });

  ipcMain.handle("dragon:augments", async () => {
    await dragon.waitForAugmentData();
    return dragon.getAugmentDataCache();
  });

  ipcMain.handle("dragon:items", async (_event, patch?: string) => {
    try {
      return await dragon.loadItemData(patch);
    } catch {
      return {};
    }
  });

  ipcMain.handle(
    "db:champion-item-stats",
    (_event, championId: number, patch?: string, queue?: number) => {
      return db.getChampionItemStats(championId, patch, queue);
    },
  );

  ipcMain.handle("db:teammate-stats", () => {
    return db.getTeammateStats();
  });

  ipcMain.handle("db:teammate-detail", async (_event, key: string) => {
    // Teammate scores are computed on the fly and need champion classes
    await dragon.waitForChampionData();
    return db.getTeammateDetail(key);
  });

  ipcMain.handle("db:global-stats", (_event, patch?: string, queue?: number) => {
    return db.getGlobalStats(patch, queue);
  });

  ipcMain.handle(
    "db:global-champion-detail",
    (_event, championId: number, patch?: string, queue?: number) => {
      return db.getGlobalChampionDetail(championId, patch, queue);
    },
  );

  ipcMain.handle("db:all-summoner-puuids", () => {
    return db.getAllPuuids();
  });

  ipcMain.handle("db:summoner-puuid", () => {
    const s = db.getSummoner();
    return s?.puuid ?? null;
  });

  // Settings
  ipcMain.handle("settings:get", (_event, key: string) => {
    return db.getSetting(key);
  });

  ipcMain.handle("settings:set", (_event, key: string, value: string) => {
    db.setSetting(key, value);
  });

  // Window controls (custom title bar)
  ipcMain.handle("window:minimize", () => {
    win.minimize();
  });

  ipcMain.handle("window:toggle-maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle("window:close", () => {
    win.close();
  });

  ipcMain.handle("window:is-maximized", () => {
    return win.isMaximized();
  });

  win.on("maximize", () => win.webContents.send("window:maximized-changed", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized-changed", false));

  // Version & updates
  ipcMain.handle("app:version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:check-update", () => {
    return updater.checkForUpdate();
  });

  ipcMain.handle("app:download-update", (_event, assetUrl: string) => {
    return updater.downloadAndInstall(win, assetUrl);
  });

  ipcMain.handle("app:open-url", (_event, url: string) => {
    shell.openExternal(url);
  });

  // Data export/import
  ipcMain.handle("data:export", async () => {
    const result = await dialog.showSaveDialog(win, {
      title: "Export Mayhem Data",
      defaultPath: `mayhem-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    const data = db.exportAllData();
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return { success: true, path: result.filePath };
  });

  ipcMain.handle("data:import", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Import Mayhem Data",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false };
    const raw = fs.readFileSync(result.filePaths[0], "utf-8");
    const data = JSON.parse(raw);
    const imported = db.importData(data);
    return { success: true, imported };
  });

  ipcMain.handle("data:repair-puuids", async () => {
    // Repair rescoring needs champion classes; wait so a repair triggered
    // right after launch doesn't score with default weights.
    await dragon.waitForChampionData();
    return db.repairPuuids();
  });

  // Community stats upload
  ipcMain.handle("upload:status", () => {
    return upload.getUploadStatus();
  });

  ipcMain.handle("upload:set-enabled", (_event, enabled: boolean) => {
    return upload.setUploadEnabled(enabled, win);
  });

  ipcMain.handle("upload:sync", () => {
    return upload.uploadPendingGames(win);
  });

  ipcMain.handle("upload:delete-contributions", () => {
    return upload.deleteContributions(win);
  });
}
