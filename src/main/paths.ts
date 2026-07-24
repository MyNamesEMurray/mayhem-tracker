import path from "path";
import fs from "fs";
import { app } from "electron";

// In development, use the project's data directory
// In production, use app.getPath('userData')
export function getDataDir() {
  const isDev = !app.isPackaged;
  const dataDir = isDev
    ? path.join(__dirname, "..", "..", "data")
    : path.join(app.getPath("userData"), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}
