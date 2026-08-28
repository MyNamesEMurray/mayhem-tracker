import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import path from "path";
import { initDatabase, getSetting, checkScoreBackfill } from "./db";
import { loadCommunity } from "./community";
import { registerIpcHandlers, attachWindowEvents } from "./ipc-handlers";
import { setMainWindow, getMainWindow } from "./window-ref";
import {
  startPolling,
  stopPolling,
  getStatus,
  fetchNewGames,
  captureFinishedGame,
  fetchCurrentQueueId,
} from "./lcu";
import { refreshLiveDebug } from "./live-debug";
import { refreshLiveWatcher, setGameEndedHandler, setQueueLookup } from "./live-watcher";
import { isUpdating } from "./update-state";
import { refreshStartupPath, startedHidden } from "./startup";
import { uploadPendingGames } from "./upload";
import { loadChampionData, loadAugmentData, waitForChampionData } from "./dragon";
import { resolveDataHome } from "./user-data";

// Must run before anything reads userData - including Electron's own
// single-instance lock file, which lives there. See user-data.ts for why the
// folder needs resolving at all.
if (app.isPackaged) {
  app.setPath("userData", resolveDataHome(app.getPath("appData")));
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let didFinalFetch = false;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });
}

const iconPath = path.join(app.getAppPath(), "assets/icon.png");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    // 900 until the tier lists learned to become cards. A tracker is used
    // beside a game, which means half a screen, and half a 1366-wide laptop
    // is 683px - under the old floor, so the window simply refused. The
    // content area is the window less 40px of padding, so 720 lands at 680
    // and the boards are past their 700px card breakpoint at the narrowest
    // the window goes.
    minWidth: 720,
    minHeight: 640,
    icon: iconPath,
    frame: false,
    backgroundColor: "#0b0e14",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  setMainWindow(mainWindow);
  attachWindowEvents(mainWindow);

  // Close behavior: minimize to tray (default) or quit. In the tray the
  // window is destroyed outright - the renderer's ~100MB+ goes back to the
  // OS while the main process keeps recording games; the tray rebuilds the
  // window on demand.
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      const minimizeToTray = getSetting("minimize_to_tray");
      if (minimizeToTray !== "false") {
        event.preventDefault();
        mainWindow?.destroy();
      } else {
        isQuitting = true;
        app.quit();
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    setMainWindow(null);
  });
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Window",
      click: () => showWindow(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("MayhemStats Tracker");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => showWindow());
}

app.whenReady().then(async () => {
  // Initialize database first
  initDatabase();

  // Load assets in background
  loadChampionData();
  loadAugmentData();

  // Warm the community cache too. Fetching it lazily meant the first click on
  // the Champions tab waited out the whole download; starting here usually
  // means it is already on disk by then, and a failure is silent because the
  // tab falls back to the previous cache anyway.
  void loadCommunity().catch(() => {});

  // Recompute stored scores once champion class data is available, so the
  // backfill uses the same class weights as insert-time scoring.
  waitForChampionData().then(() => {
    if (checkScoreBackfill()) {
      getMainWindow()?.webContents.send("lcu:games-updated");
    }
  });

  registerIpcHandlers();
  // Launched by the OS login entry: no window, just the tray. Recording and
  // uploading run without one, and the tray builds it on demand.
  if (!startedHidden()) createWindow();
  createTray();
  refreshStartupPath();

  // LCU polling runs for the app's lifetime, window or no window
  startPolling();

  // Live game debug recorder (no-op unless enabled in Settings)
  refreshLiveDebug();

  // Build-order tracking during games (on by default). The queue lookup is
  // registered first so a game already running when the app starts gets one.
  setQueueLookup(fetchCurrentQueueId);
  refreshLiveWatcher();

  // Riot publishes a finished match to the client a few seconds after the
  // game ends, so chase it briefly instead of waiting for the next poll
  setGameEndedHandler(() => {
    void (async () => {
      // The post-game screen exposes the finished game long before it shows
      // up in the match list (measured: minutes), so try that first and fall
      // back to a history sweep. Keep at it across ~5 minutes; the 60s poll
      // is the backstop after that.
      for (const delay of [5000, 8000, 12000, 20000, 30000, 45000, 60000, 60000, 60000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          if (await captureFinishedGame()) return;
          const result = await fetchNewGames(getMainWindow());
          if (result && "newGames" in result && result.newGames > 0) return;
        } catch {
          // Client closed or busy - keep trying for the remaining attempts
        }
      }
    })();
  });

  // Finish any community upload a previous session left pending
  void uploadPendingGames(getMainWindow());
});

app.on("before-quit", async (event) => {
  isQuitting = true;

  // Skipped entirely during an update - the installer/swap script is
  // waiting for this process to exit and a slow LCU would stall it
  if (!didFinalFetch && !isUpdating() && getStatus() === "connected") {
    event.preventDefault();
    didFinalFetch = true;
    try {
      console.log("Fetching games before quit...");
      // A hung LCU request must never block quitting indefinitely
      await Promise.race([
        fetchNewGames(getMainWindow()),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
    } catch (err) {
      console.log("Final fetch on quit failed:", err);
    }
    stopPolling();
    app.quit();
  } else {
    stopPolling();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Don't quit - we have the tray
  }
});

app.on("activate", () => {
  showWindow();
});
