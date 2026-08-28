import fs from "fs";
import path from "path";

// Where the app keeps its database, settled once at startup.
//
// Electron names userData from package.json's top-level "name" - not from
// electron-builder's build.productName, which only labels the exe and the
// installer. So every build through v2.9.3 stored data in
// %APPDATA%\mayhem-tracker. v2.10.0 pinned userData to "Mayhem Tracker"
// believing the rename would move it; that folder had never been used, so
// installs opened as if brand new with their history stranded next door.
//
// Settle on one folder named after the product and move whichever previous
// folder actually holds a database into it. A rename is a single atomic
// operation within %APPDATA%, so there is no window where the data is half
// copied - and nothing is ever deleted. If Windows has the old folder
// locked (antivirus, an open Explorer window), fall back to reading it
// where it sits and try the move again next launch.
export const DATA_DIR_NAME = "MayhemStats Tracker";

// Oldest first: "mayhem-tracker" is the real history, "Mayhem Tracker" only
// ever held whatever v2.10.0 recorded before this was caught.
export const PREVIOUS_DIR_NAMES = ["mayhem-tracker", "Mayhem Tracker"];

function hasDatabase(dir: string): boolean {
  return fs.existsSync(path.join(dir, "data", "matches.db"));
}

export function resolveDataHome(appData: string): string {
  const target = path.join(appData, DATA_DIR_NAME);
  if (hasDatabase(target)) return target;

  const previous = PREVIOUS_DIR_NAMES.map((name) => path.join(appData, name)).find(hasDatabase);
  if (!previous) return target; // fresh install

  // Renaming onto an existing directory fails on Windows, so only try when
  // the destination is genuinely absent.
  if (!fs.existsSync(target)) {
    try {
      fs.renameSync(previous, target);
      return target;
    } catch (err) {
      console.warn(`userData move deferred, using ${previous}: ${err}`);
    }
  }
  return previous;
}
