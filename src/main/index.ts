import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import path from "path";
import { initDatabase, getSetting, checkScoreBackfill } from "./db";
import { registerIpcHandlers, attachWindowEvents } from "./ipc-handlers";
import { setMainWindow, getMainWindow } from "./window-ref";
import { startPolling, stopPolling, getStatus, fetchNewGames } from "./lcu";
import { refreshLiveDebug } from "./live-debug";
import { refreshLiveWatcher } from "./live-watcher";
import { isUpdating } from "./update-state";
import { uploadPendingGames } from "./upload";
import { loadChampionData, loadAugmentData, waitForChampionData } from "./dragon";

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
    minWidth: 900,
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
  // window is destroyed outright — the renderer's ~100MB+ goes back to the
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

  tray.setToolTip("Mayhem Tracker");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => showWindow());
}

app.whenReady().then(async () => {
  // Initialize database first
  initDatabase();

  // Load assets in background
  loadChampionData();
  loadAugmentData();

  // Recompute stored scores once champion class data is available, so the
  // backfill uses the same class weights as insert-time scoring.
  waitForChampionData().then(() => {
    if (checkScoreBackfill()) {
      getMainWindow()?.webContents.send("lcu:games-updated");
    }
  });

  registerIpcHandlers();
  createWindow();
  createTray();

  // LCU polling runs for the app's lifetime, window or no window
  startPolling();

  // Live game debug recorder (no-op unless enabled in Settings)
  refreshLiveDebug();

  // Build-order tracking during games (on by default)
  refreshLiveWatcher();

  // Finish any community upload a previous session left pending
  void uploadPendingGames(getMainWindow());
});

app.on("before-quit", async (event) => {
  isQuitting = true;

  // Skipped entirely during an update — the installer/swap script is
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
    // Don't quit — we have the tray
  }
});

app.on("activate", () => {
  showWindow();
});
