// Works out which version an app change merging into main should ship as.
//
// The rule is a patch bump per merge that touches the app, with one exception:
// a version in package.json that has never been tagged is someone having
// deliberately chosen a minor or a major, and ships as written. Everything else
// takes the next patch after the highest version players can already download.
//
//   tagged 2.14.0, package.json 2.14.0  ->  2.14.1, which the release job
//                                           writes back into package.json
//   tagged 2.14.0, package.json 2.15.0  ->  2.15.0, already written
//
// The highest released version is read from the v* tags rather than from
// package.json, because package.json only moves when a release runs while the
// tags are the record of what actually shipped. A run that built and tagged but
// failed before pushing the bump would otherwise re-cut the version it just
// published.

export interface NextVersion {
  version: string;
  // Whether package.json still has to be written and pushed for this version
  bump: boolean;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

// Numeric, segment by segment. String order gets 2.9.0 and 2.10.0 backwards,
// and this decides which version is the newest one shipped.
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

// The newest x.y.z among the given tags, or null if there are none. Tags that
// aren't three numeric segments are ignored rather than guessed at.
export function highestRelease(tags: string[]): string | null {
  const versions = tags
    .map((tag) => tag.trim().replace(/^v/, ""))
    .filter((tag) => SEMVER.test(tag))
    .sort(compareVersions);
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

export function nextVersion(packageVersion: string, tags: string[]): NextVersion {
  if (!SEMVER.test(packageVersion)) {
    throw new Error(`package.json version is not x.y.z: ${packageVersion}`);
  }
  const highest = highestRelease(tags);
  if (highest === null || compareVersions(packageVersion, highest) > 0) {
    return { version: packageVersion, bump: false };
  }
  const [major, minor, patch] = highest.split(".").map(Number);
  return { version: `${major}.${minor}.${patch + 1}`, bump: true };
}

// Run directly, this prints "<version> <bump>" for the workflow to read. The
// guard keeps it from firing when the tests import the functions above.
if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version as string;
  const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n");
  const next = nextVersion(packageVersion, tags);
  process.stdout.write(`${next.version} ${next.bump}\n`);
}
