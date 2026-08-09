import type { BrowserWindow } from "electron";

// Single source of truth for the (possibly absent) main window. The window
// is destroyed while the app idles in the tray — anything that wants to send
// to the renderer resolves it here at send time instead of holding a
// reference that can go stale.
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}
