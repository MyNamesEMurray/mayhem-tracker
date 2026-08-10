import { app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export interface UpdateInfo {
  hasUpdate: boolean;
  latest?: string;
  current?: string;
  url?: string;
  assetUrl?: string;
  assetSize?: number;
  error?: string;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/MyNamesEMurray/mayhem-tracker/releases/latest",
      {
        headers: { "User-Agent": "mayhem-tracker" },
      },
    );
    if (!res.ok) return { hasUpdate: false, error: "No releases found" };
    const data = (await res.json()) as any;
    const latest = (data.tag_name as string).replace(/^v/, "");
    const current = app.getVersion();
    const asset = (data.assets as any[])?.find((a) => a.name?.endsWith(".exe"));
    return {
      hasUpdate: latest !== current,
      latest,
      current,
      url: data.html_url as string,
      assetUrl: asset?.browser_download_url,
      assetSize: asset?.size,
    };
  } catch {
    return { hasUpdate: false, error: "Failed to check for updates" };
  }
}

export async function downloadAndInstall(
  win: BrowserWindow | null,
  assetUrl: string,
): Promise<{ success: boolean; error?: string }> {
  // Set by electron-builder's portable launcher; absent in dev and non-portable builds
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!portableExe) {
    return { success: false, error: "In-app update only works in the portable exe build" };
  }
  if (!assetUrl.startsWith("https://github.com/MyNamesEMurray/mayhem-tracker/")) {
    return { success: false, error: "Unexpected download URL" };
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

  // Install under the artifact name (productName minus spaces) regardless of the
  // current filename, so exes downloaded before the version was dropped from the
  // artifact name get migrated.
  const targetExe = path.join(path.dirname(portableExe), `${app.getName().replace(/ /g, "")}.exe`);
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

  spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  // Let the IPC response reach the renderer before quitting
  setTimeout(() => app.quit(), 200);
  return { success: true };
}
