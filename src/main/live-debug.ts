import https from "https";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { app } from "electron";
import { getDataDir } from "./paths";
import { getSetting } from "./db";

// Debug recorder for Riot's Live Client Data API. While enabled it probes
// https://127.0.0.1:2999 (only up during an active game) and, once a game is
// found, snapshots the full /allgamedata payload every couple of seconds
// into a gzipped JSONL file. Raw and local-only — nothing derived, nothing
// uploaded. The point is to capture everything the API exposes for a real
// game so item purchase order (and whatever else shows up, e.g. augment
// state) can be designed against actual data.

// The game's local API serves a self-signed Riot certificate; verification
// is skipped only for this fixed loopback URL.
const LIVE_URL = "https://127.0.0.1:2999/liveclientdata/allgamedata";
const PROBE_MS = 10_000;
const SNAPSHOT_MS = 2_000;
// The API drops when the game ends; a few misses in a row closes the file
const MAX_FAILURES = 3;

let probeTimer: ReturnType<typeof setInterval> | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let gz: zlib.Gzip | null = null;
let failures = 0;
let lastFile: string | null = null;
let ticking = false;

export function recordingsDir(): string {
  return path.join(getDataDir(), "live-debug");
}

function fetchLive(): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(LIVE_URL, { rejectUnauthorized: false, timeout: 1500 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function writeLine(obj: unknown) {
  gz?.write(JSON.stringify(obj) + "\n");
}

function startRecording(firstSnapshot: any) {
  const dir = recordingsDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `live-${stamp}.jsonl.gz`);
  gz = zlib.createGzip();
  gz.pipe(fs.createWriteStream(file));
  lastFile = file;
  failures = 0;
  writeLine({
    type: "meta",
    recordedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    pollMs: SNAPSHOT_MS,
  });
  writeLine({ type: "snapshot", ts: Date.now(), data: firstSnapshot });
  snapshotTimer = setInterval(tick, SNAPSHOT_MS);
  console.log("Live debug: recording to", file);
}

function stopRecording() {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  if (gz) {
    writeLine({ type: "end", ts: Date.now() });
    gz.end();
    gz = null;
    console.log("Live debug: recording closed");
  }
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const data = await fetchLive();
    failures = 0;
    writeLine({ type: "snapshot", ts: Date.now(), data });
  } catch {
    if (++failures >= MAX_FAILURES) stopRecording();
  } finally {
    ticking = false;
  }
}

async function probe() {
  if (snapshotTimer) return;
  try {
    const data = await fetchLive();
    startRecording(data);
  } catch {
    // No game running — keep probing
  }
}

// Reads the setting and starts/stops the watcher to match; call at startup
// and whenever the setting changes.
export function refreshLiveDebug() {
  const enabled = getSetting("live_debug_enabled") === "true";
  if (enabled && !probeTimer) {
    probeTimer = setInterval(probe, PROBE_MS);
    void probe();
  } else if (!enabled && probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
    stopRecording();
  }
}

export function getLiveDebugStatus() {
  return {
    enabled: getSetting("live_debug_enabled") === "true",
    recording: snapshotTimer !== null,
    dir: recordingsDir(),
    lastFile,
  };
}
