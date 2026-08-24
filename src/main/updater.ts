import { app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { setUpdating } from "./update-state";
import { buildReleaseNotes } from "./release-notes";
import { compareVersions } from "../shared/version";

export interface UpdateInfo {
  hasUpdate: boolean;
  latest?: string;
  current?: string;
  url?: string;
  assetUrl?: string;
  assetSize?: number;
  notes?: string;
  error?: string;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    // The whole list, not just /latest: someone several versions behind should
    // read everything they're about to install, not only the last entry.
    const res = await fetch(
      "https://api.github.com/repos/MyNamesEMurray/mayhem-tracker/releases?per_page=30",
      {
        headers: { "User-Agent": "mayhem-tracker" },
      },
    );
    if (!res.ok) return { hasUpdate: false, error: "No releases found" };
    const all = (await res.json()) as any[];
    const published = (Array.isArray(all) ? all : [])
      .filter((r) => !r.draft && !r.prerelease && typeof r.tag_name === "string")
      .map((r) => ({ ...r, version: (r.tag_name as string).replace(/^v/, "") }))
      .sort((a, b) => compareVersions(b.version, a.version));
    if (published.length === 0) return { hasUpdate: false, error: "No releases found" };

    const data = published[0];
    const latest = data.version;
    const current = app.getVersion();
    // Pick the asset matching how this copy runs: the portable build swaps
    // its own exe, the installed build re-runs the installer silently.
    // Older releases named the portable plain MayhemTracker.exe.
    const assets = (data.assets as any[]) ?? [];
    const asset = process.env.PORTABLE_EXECUTABLE_FILE
      ? (assets.find((a) => a.name === "MayhemTracker-Portable.exe") ??
        assets.find((a) => a.name === "MayhemTracker.exe") ??
        assets.find((a) => a.name?.endsWith(".exe") && !a.name.includes("Setup")))
      : assets.find((a) => a.name === "MayhemTracker-Setup.exe");
    return {
      hasUpdate: compareVersions(latest, current) > 0,
      latest,
      current,
      url: data.html_url as string,
      assetUrl: asset?.browser_download_url,
      assetSize: asset?.size,
      notes: buildReleaseNotes(
        published.map((r) => ({
          version: r.version,
          body: typeof r.body === "string" ? r.body : "",
        })),
        current,
      ),
    };
  } catch {
    return { hasUpdate: false, error: "Failed to check for updates" };
  }
}

export async function downloadAndInstall(
  win: BrowserWindow | null,
  assetUrl: string,
): Promise<{ success: boolean; error?: string }> {
  // Set by electron-builder's portable launcher; absent in dev and installed builds
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  const installed = !portableExe && app.isPackaged;
  if (!portableExe && !installed) {
    return { success: false, error: "In-app update only works in packaged builds" };
  }
  if (!assetUrl.startsWith("https://github.com/MyNamesEMurray/mayhem-tracker/")) {
    return { success: false, error: "Unexpected download URL" };
  }

  // Best-effort sweep of temp dirs left by earlier updates (the installed
  // path can't clean up after itself — nothing outlives the process)
  try {
    const tmpRoot = os.tmpdir();
    for (const entry of fs.readdirSync(tmpRoot)) {
      if (entry.startsWith("mayhem-update-")) {
        fs.rmSync(path.join(tmpRoot, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // Locked or missing entries are fine to leave behind
  }

  let tmpDir: string;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mayhem-update-"));
  } catch (err: any) {
    return { success: false, error: `Failed to create temp dir: ${err.message}` };
  }

  const newExe = path.join(tmpDir, "mayhem-tracker-update.exe");
  try {
    const res = await fetch(assetUrl, { headers: { "User-Agent": "mayhem-tracker" } });
    if (!res.ok || !res.body) {
      return { success: false, error: `Download failed (HTTP ${res.status})` };
    }
    const total = Number(res.headers.get("content-length")) || 0;
    const out = fs.createWriteStream(newExe);
    const reader = res.body.getReader();
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) {
        await new Promise((resolve) => out.once("drain", resolve));
      }
      if (total) {
        if (win && !win.isDestroyed())
          win.webContents.send("update:progress", Math.round((received / total) * 100));
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.end(() => resolve());
      out.on("error", reject);
    });
    if (total && received !== total) {
      return { success: false, error: "Download incomplete, please try again" };
    }
  } catch (err: any) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { success: false, error: `Download failed: ${err.message}` };
  }

  // Installed build: run the downloaded one-click installer directly —
  // it's a GUI executable, so no console window appears. /S installs
  // per-user without UI, --force-run relaunches the app when it finishes,
  // and the installer itself waits out (or kills) a still-running app, so
  // no wrapper script is needed. The temp installer is swept on the next
  // update rather than here, since nothing outlives us to clean it.
  if (installed) {
    setUpdating(true);
    spawn(newExe, ["/S", "--force-run"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    // Let the IPC response reach the renderer before quitting
    setTimeout(() => app.quit(), 200);
    return { success: true };
  }

  // Install under the current artifact name regardless of the running
  // filename, so exes downloaded under older names get migrated.
  const targetExe = path.join(path.dirname(portableExe!), "MayhemTracker-Portable.exe");
  const stagedExe = `${targetExe}.new`;

  // The running portable exe is locked by the OS until the app fully exits, so a
  // detached script stages the new exe next to the old one, waits for the lock to
  // release, swaps them, and relaunches. The old exe is only deleted once the
  // staged copy is in place, and ping is used as the delay because timeout errors
  // out when stdin is redirected.
  const script = path.join(tmpDir, "update.cmd");
  fs.writeFileSync(
    script,
    [
      "@echo off",
      `copy /y "${newExe}" "${stagedExe}" >nul 2>&1`,
      "if errorlevel 1 goto fail",
      "set tries=0",
      ":wait",
      "set /a tries+=1",
      "if %tries% gtr 120 goto fail",
      "ping -n 2 127.0.0.1 >nul",
      `del /f "${portableExe}" >nul 2>&1`,
      `if exist "${portableExe}" goto wait`,
      `move /y "${stagedExe}" "${targetExe}" >nul 2>&1`,
      `start "" "${targetExe}"`,
      "goto cleanup",
      ":fail",
      `del /f "${stagedExe}" >nul 2>&1`,
      `start "" "${portableExe}"`,
      ":cleanup",
      `rd /s /q "${tmpDir}"`,
      "",
    ].join("\r\n"),
  );

  setUpdating(true);
  spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  // Let the IPC response reach the renderer before quitting
  setTimeout(() => app.quit(), 200);
  return { success: true };
}
