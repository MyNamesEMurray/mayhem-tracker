import { compareVersions } from "../shared/version";

export interface ReleaseSummary {
  version: string;
  body: string;
}

// A bullet can declare which release introduced the problem it fixes:
//
//   - <!--fixes:v2.10.0--> Fixed the app opening as if it were a fresh install.
//
// Whether that's worth telling someone depends on where they're coming from.
// A player on v2.10.0 hit the bug and wants to know it's gone. A player
// jumping from v2.9.3 straight past it never saw it, so the note is noise
// about a version they never ran - and reads alarmingly, since it describes
// data loss they never experienced.
//
// This can't be inferred: nothing in "Fixed X" says which release broke X.
// The marker is the author saying so, and it's an HTML comment so GitHub
// hides it while leaving it in the raw release body for us to read.
const FIXES_MARKER = /<!--\s*fixes:\s*v?(\d+(?:\.\d+)*)\s*-->/i;

// Notes for every release between what someone is running and what they're
// about to install - not just the newest one, which is all they used to see
// when skipping versions.
export function buildReleaseNotes(
  releases: ReleaseSummary[],
  currentVersion: string,
  maxSections = 20,
): string {
  const newer = releases
    .filter((r) => compareVersions(r.version, currentVersion) > 0)
    .sort((a, b) => compareVersions(b.version, a.version));

  const sections: string[] = [];
  for (const release of newer.slice(0, maxSections)) {
    const body = release.body
      .split("\n")
      .map((line) => applyMarker(line, currentVersion))
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim();
    // A release whose every bullet was filtered out has nothing left to say
    if (body) sections.push(`## v${release.version}\n${body}`);
  }

  const omitted = newer.length - Math.min(newer.length, maxSections);
  if (omitted > 0) {
    sections.push(`…and ${omitted} earlier release${omitted === 1 ? "" : "s"}.`);
  }
  return sections.join("\n\n");
}

// Returns the line with the marker stripped, or null to drop it entirely.
function applyMarker(line: string, currentVersion: string): string | null {
  const match = line.match(FIXES_MARKER);
  if (!match) return line;
  if (compareVersions(currentVersion, match[1]) < 0) return null; // never ran it
  return line.replace(FIXES_MARKER, "").replace(/^(\s*[-*]\s*)\s+/, "$1");
}
