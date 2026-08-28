import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI, LcuStatus, LiveGameState } from "../shared/api";

// Declared as ElectronAPI rather than inferred, so the compiler checks this
// object against the contract the renderer calls through. Without it the two
// were written freehand against each other and could disagree silently - a
// mismatch that surfaces as a call failing at runtime, not as a build error.
//
// Every method here returns ipcRenderer.invoke(...), which is Promise<any>, so
// the annotation is what gives call sites their real return types too.
const api: ElectronAPI = {
  getMatchHistory: (
    limit: number,
    offset: number,
    filters?: {
      championId?: number;
      patches?: string[];
      queue?: number;
      sort?: string;
      sortDir?: string;
      multikills?: string[];
    },
  ) => ipcRenderer.invoke("db:match-history", limit, offset, filters),

  getMatchFilterOptions: (filters?: { championId?: number; patches?: string[]; queue?: number }) =>
    ipcRenderer.invoke("db:match-filters", filters),

  getMatchDetail: (gameId: number) => ipcRenderer.invoke("db:match-detail", gameId),

  toggleFavorite: (gameId: number) => ipcRenderer.invoke("db:toggle-favorite", gameId),

  getChampionStats: (patches?: string[], queue?: number) =>
    ipcRenderer.invoke("db:champion-stats", patches, queue),

  getAugmentStats: (championId?: number, patches?: string[], queue?: number) =>
    ipcRenderer.invoke("db:augment-stats", championId, patches, queue),

  getAugmentStatsDetailed: (patches?: string[], queue?: number) =>
    ipcRenderer.invoke("db:augment-stats-detailed", patches, queue),

  getDashboard: (filters?: { championId?: number; patches?: string[]; queue?: number }) =>
    ipcRenderer.invoke("db:dashboard", filters),

  getChampionMatchHistory: (
    championId: number,
    limit: number,
    offset: number,
    patches?: string[],
    queue?: number,
  ) => ipcRenderer.invoke("db:champion-match-history", championId, limit, offset, patches, queue),

  refreshGames: () => ipcRenderer.invoke("lcu:refresh"),

  backfillHistory: () => ipcRenderer.invoke("lcu:backfill"),

  cancelBackfill: () => ipcRenderer.invoke("lcu:cancel-backfill"),

  isBackfillRunning: () => ipcRenderer.invoke("lcu:backfill-running"),

  onBackfillDone: (callback: (result: any) => void) => {
    const handler = (_event: any, result: any) => callback(result);
    ipcRenderer.on("lcu:backfill-done", handler);
    return () => ipcRenderer.removeListener("lcu:backfill-done", handler);
  },

  onBackfillProgress: (
    callback: (progress: { current: number; total: number; added: number }) => void,
  ) => {
    const handler = (_event: any, progress: { current: number; total: number; added: number }) =>
      callback(progress);
    ipcRenderer.on("lcu:backfill-progress", handler);
    return () => ipcRenderer.removeListener("lcu:backfill-progress", handler);
  },

  getLcuStatus: () => ipcRenderer.invoke("lcu:status"),

  getChampionData: () => ipcRenderer.invoke("dragon:champions"),

  getAugmentData: () => ipcRenderer.invoke("dragon:augments"),

  getItemData: (patch?: string) => ipcRenderer.invoke("dragon:items", patch),

  getChampionItemStats: (championId: number, patches?: string[], queue?: number) =>
    ipcRenderer.invoke("db:champion-item-stats", championId, patches, queue),

  getContributedChampionCounts: (patches?: string[], queue?: number) =>
    ipcRenderer.invoke("stats:contributed-champions", patches, queue),

  getTeammateStats: () => ipcRenderer.invoke("db:teammate-stats"),

  getTeammateDetail: (key: string) => ipcRenderer.invoke("db:teammate-detail", key),

  getCommunityChampionStats: (patches?: string[], queue?: number) =>
    ipcRenderer.invoke("community:champion-stats", patches, queue),

  getCommunityChampionDetail: (championId: number, patches?: string[], queue?: number) =>
    ipcRenderer.invoke("community:champion-detail", championId, patches, queue),

  getCommunityAugmentStats: (patches?: string[], queue?: number) =>
    ipcRenderer.invoke("community:augment-stats", patches, queue),
  getCommunityAugmentPairs: (augmentId: number, patches?: string[], queue?: number) =>
    ipcRenderer.invoke("community:augment-pairs", augmentId, patches, queue),

  getCommunityAugmentChampions: (augmentId: number, patches?: string[], queue?: number) =>
    ipcRenderer.invoke("community:augment-champions", augmentId, patches, queue),
  getContributorId: () => ipcRenderer.invoke("contributor:get"),
  setContributorId: (token: string) => ipcRenderer.invoke("contributor:set", token),
  rotateContributorId: () => ipcRenderer.invoke("contributor:rotate"),
  getCommunityMeta: () => ipcRenderer.invoke("community:meta"),

  refreshCommunity: () => ipcRenderer.invoke("community:refresh"),

  getSummonerPuuid: () => ipcRenderer.invoke("db:summoner-puuid"),

  getAllSummonerPuuids: () => ipcRenderer.invoke("db:all-summoner-puuids"),

  onStatusChanged: (callback: (status: LcuStatus) => void) => {
    const handler = (_event: unknown, status: LcuStatus) => callback(status);
    ipcRenderer.on("lcu:status-changed", handler);
    return () => ipcRenderer.removeListener("lcu:status-changed", handler);
  },

  onGamesUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("lcu:games-updated", handler);
    return () => ipcRenderer.removeListener("lcu:games-updated", handler);
  },

  getLiveGame: () => ipcRenderer.invoke("live:get"),

  onLiveGame: (callback: (state: LiveGameState) => void) => {
    const handler = (_e: unknown, state: LiveGameState) => callback(state);
    ipcRenderer.on("live:changed", handler);
    return () => ipcRenderer.removeListener("live:changed", handler);
  },

  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key),

  setSetting: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),

  exportData: () => ipcRenderer.invoke("data:export"),

  importData: () => ipcRenderer.invoke("data:import"),

  repairPuuids: () => ipcRenderer.invoke("data:repair-puuids"),

  getUploadStatus: () => ipcRenderer.invoke("upload:status"),

  setUploadEnabled: (enabled: boolean) => ipcRenderer.invoke("upload:set-enabled", enabled),

  syncUpload: () => ipcRenderer.invoke("upload:sync"),

  deleteContributions: () => ipcRenderer.invoke("upload:delete-contributions"),

  onUploadChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("upload:changed", handler);
    return () => ipcRenderer.removeListener("upload:changed", handler);
  },

  getDiagnostics: () => ipcRenderer.invoke("diag:snapshot"),

  getStartupStatus: () => ipcRenderer.invoke("startup:status"),

  setStartupEnabled: (enabled: boolean) => ipcRenderer.invoke("startup:set-enabled", enabled),

  getLiveDebugStatus: () => ipcRenderer.invoke("livedebug:status"),

  setLiveDebugEnabled: (enabled: boolean) => ipcRenderer.invoke("livedebug:set-enabled", enabled),

  openLiveDebugFolder: () => ipcRenderer.invoke("livedebug:open-folder"),

  getVersion: () => ipcRenderer.invoke("app:version"),

  checkForUpdate: () => ipcRenderer.invoke("app:check-update"),

  downloadUpdate: (assetUrl: string) => ipcRenderer.invoke("app:download-update", assetUrl),

  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_event: any, percent: number) => callback(percent);
    ipcRenderer.on("update:progress", handler);
    return () => ipcRenderer.removeListener("update:progress", handler);
  },

  openUrl: (url: string) => ipcRenderer.invoke("app:open-url", url),

  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),

  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),

  closeWindow: () => ipcRenderer.invoke("window:close"),

  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),

  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    const handler = (_event: any, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximized-changed", handler);
    return () => ipcRenderer.removeListener("window:maximized-changed", handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
