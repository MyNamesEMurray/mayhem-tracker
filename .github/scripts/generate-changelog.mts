// Writes a CHANGELOG section from the commits a release is made of.
//
// v2.14.5 shipped empty because nobody wrote its section, and the app's update
// window skips a release with nothing in it - so the largest set of
// player-visible changes in months reached nobody. This exists so a release is
// never silently empty again.
//
// What it does not do is write good notes. Commit subjects are written for
// whoever reads the diff next; the CHANGELOG is written for someone deciding
// whether to click Update. "Warn when a release is about to ship with no
// notes" means nothing to a player. So a generated section is a floor, not a
// finish: it guarantees something is there, and it is marked as generated so
// the next person can see it was never edited.
//
// Three rules keep it from doing harm:
//
//   1. A hand-written section always wins. This only ever fills a gap, and
//      never touches a version someone has already written about.
//   2. Only commits that touched the app are listed. A merge carrying website
//      and Supabase work alongside one app fix should not tell players about
//      the parts they cannot see.
//   3. Release commits and merge commits are dropped, because "Release
//      v2.14.5" and "Merge branch ..." are not changes.

export interface Commit {
  subject: string;
  // Whether this commit touched a file the desktop app is built from. The
  // workflow decides that with the same path filter it uses to decide whether
  // to release at all.
  touchedApp: boolean;
}

// The line that marks a section as machine-written. Kept as an HTML comment so
// GitHub hides it in the release body, the same trick the fixes marker uses -
// a player never sees it, and anyone opening CHANGELOG.md does.
export const GENERATED_MARKER =
  "<!-- Written from commit subjects because this version had no section. " +
  "Rewrite in player language: what changed, and why they would care. -->";

const RELEASE_SUBJECT = /^Release v\d+\.\d+\.\d+/i;
const MERGE_SUBJECT = /^Merge (branch|pull request|remote-tracking)/i;

export function usableCommits(commits: Commit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { subject, touchedApp } of commits) {
    const line = subject.trim();
    if (!line || !touchedApp) continue;
    if (RELEASE_SUBJECT.test(line) || MERGE_SUBJECT.test(line)) continue;
    // A subject repeated across a rebase or a revert-and-redo says the same
    // thing twice in the notes
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

// The section body, or "" when there is nothing worth listing - in which case
// the caller leaves the changelog alone and the release publishes empty, which
// is the correct outcome for a version whose only commits were a version bump
// or work the app does not ship.
export function generateSection(commits: Commit[]): string {
  const subjects = usableCommits(commits);
  if (subjects.length === 0) return "";
  return [GENERATED_MARKER, "", ...subjects.map((s) => `- ${s}`)].join("\n");
}

// Inserts the section above the newest existing version heading, which is
// where a hand-written one would go. Returns the changelog unchanged when the
// version already has a section, so this can never overwrite real notes.
export function insertSection(
  changelog: string,
  version: string,
  date: string,
  body: string,
): string {
  const bare = version.replace(/^v/, "");
  const heading = new RegExp(`^## v${bare.replace(/\./g, "\\.")}(?![0-9.])`, "m");
  if (heading.test(changelog) || !body) return changelog;

  const lines = changelog.split("\n");
  // The first version heading in the file. Everything above it is the preamble
  // explaining how to write these, which stays put.
  const at = lines.findIndex((line) => /^## v\d+\.\d+\.\d+/.test(line));
  const section = `## v${bare} - ${date}\n\n${body}\n`;
  if (at === -1) return `${changelog.replace(/\n*$/, "\n")}\n${section}`;
  return [...lines.slice(0, at), section, ...lines.slice(at)].join("\n");
}

// Run directly:
//
//   generate-changelog.mts <version> <base-sha> <app-path-regex>
//
// Rewrites CHANGELOG.md in place and prints what it did, or prints "kept" and
// changes nothing when the version already has a section.
if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync, writeFileSync } = await import("node:fs");

  const [version, base, appPattern] = process.argv.slice(2);
  if (!version || !base || !appPattern) {
    process.stderr.write("usage: generate-changelog.mts <version> <base-sha> <app-regex>\n");
    process.exit(2);
  }

  const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" });
  const appRe = new RegExp(appPattern);

  // One commit per line, oldest first, so the notes read in the order the work
  // landed. %H and %s are separated by a tab, which a subject cannot contain.
  const log = git(["log", "--no-merges", "--reverse", "--format=%H\t%s", `${base}..HEAD`]);
  const commits: Commit[] = log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split("\t");
      const files = git(["show", "--name-only", "--format=", sha]).split("\n").filter(Boolean);
      return { subject: rest.join("\t"), touchedApp: files.some((f) => appRe.test(f)) };
    });

  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const body = generateSection(commits);
  const date = new Date().toISOString().slice(0, 10);
  const next = insertSection(changelog, version, date, body);

  if (next === changelog) {
    process.stdout.write("kept\n");
  } else {
    writeFileSync("CHANGELOG.md", next);
    process.stdout.write(`generated ${usableCommits(commits).length}\n`);
  }
}
