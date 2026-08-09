import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import path from "path";
import { initDatabase, getSetting, checkScoreBackfill } from "./db";
import { registerIpcHandlers } from "./ipc-handlers";
import { startPolling, stopPolling, getStatus, fetchNewGames } from "./lcu";
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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
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

  // Close behavior: minimize to tray (default) or quit
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      const minimizeToTray = getSetting("minimize_to_tray");
      if (minimizeToTray !== "false") {
        event.preventDefault();
        mainWindow?.hide();
      } else {
        isQuitting = true;
        app.quit();
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Register IPC handlers
  registerIpcHandlers(mainWindow);

  // Start LCU polling
  startPolling(mainWindow);
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Window",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
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
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
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
      mainWindow?.webContents.send("lcu:games-updated");
    }
  });

  createWindow();
  createTray();

  // Finish any community upload a previous session left pending
  void uploadPendingGames(mainWindow);
});

app.on("before-quit", async (event) => {
  isQuitting = true;

  if (!didFinalFetch && getStatus() === "connected") {
    event.preventDefault();
    didFinalFetch = true;
    try {
      console.log("Fetching games before quit...");
      await fetchNewGames(mainWindow);
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
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
