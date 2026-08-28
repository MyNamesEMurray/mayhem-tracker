import { app } from "electron";

// Launch on login, straight into the tray. Registered with the OS rather
// than tracked in our own settings, so the checkbox always reflects what
// Windows will actually do.
//
// The exe the OS should run is the portable file when running portable
// (process.execPath points at a temp extraction there) and the installed
// binary otherwise.

export const HIDDEN_FLAG = "--hidden";

function supported(): boolean {
  return app.isPackaged && (process.platform === "win32" || process.platform === "darwin");
}

function exePath(): string {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

export function getStartupEnabled(): boolean {
  if (!supported()) return false;
  return app.getLoginItemSettings({ path: exePath(), args: [HIDDEN_FLAG] }).openAtLogin;
}

export function setStartupEnabled(enabled: boolean): boolean {
  if (!supported()) return false;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: exePath(),
    args: [HIDDEN_FLAG],
  });
  return getStartupEnabled();
}

// Portable exes get renamed by updates (and can be moved by hand), which
// leaves the login entry pointing at a file that no longer exists. When the
// entry is on but stale, re-register it against the current path.
export function refreshStartupPath(): void {
  if (!supported() || !process.env.PORTABLE_EXECUTABLE_FILE) return;
  const current = app.getLoginItemSettings({ path: exePath(), args: [HIDDEN_FLAG] });
  if (!current.openAtLogin && app.getLoginItemSettings().openAtLogin) {
    // An entry exists for some other path - point it at this exe
    app.setLoginItemSettings({ openAtLogin: false });
    setStartupEnabled(true);
  }
}

// True when this launch came from the OS login entry, so the window should
// stay closed and the app should sit in the tray
export function startedHidden(): boolean {
  return process.argv.includes(HIDDEN_FLAG);
}

export function isStartupSupported(): boolean {
  return supported();
}
