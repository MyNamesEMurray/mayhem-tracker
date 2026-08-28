// Reads one version's section out of CHANGELOG.md.
//
// Two callers ask the same question at different moments, and they used to ask
// it two different ways. The gate wants to know, before a Windows build runs,
// whether the version it is about to cut has anything to tell players. The
// release job wants the text itself, and did its own `awk` for it. Two matchers
// for one question is one of them being subtly wrong at some point - a version
// whose section the gate cannot see but awk can, or the reverse - so there is
// one here and it is tested.
//
// An empty section is not a failure. Most auto-cut patch releases genuinely
// have nothing worth telling anyone, publish with an empty body on purpose,
// and are skipped by the app's update window. What this exists to catch is the
// other case: a release that changed plenty and says nothing, which is what
// v2.14.5 did.

// A heading opens a section: "## v2.14.5 - 2026-08-28". The version has to
// match to its end, so v2.14.5 does not answer for v2.14.50.
function headingFor(version: string): RegExp {
  const escaped = version.replace(/^v/, "").replace(/\./g, "\\.");
  return new RegExp(`^## v${escaped}(?![0-9.])`);
}

// The lines under this version's heading, up to the next heading. Trimmed,
// so a section holding only blank lines reads as absent rather than as a body
// made of whitespace - which would publish a release the update window shows
// with nothing in it.
export function extractSection(changelog: string, version: string): string {
  const heading = headingFor(version);
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return "";

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

export function hasSection(changelog: string, version: string): boolean {
  return extractSection(changelog, version) !== "";
}

// Run directly:
//
//   changelog-section.mts v2.14.5           prints the section, exit 0
//                                           prints nothing, exit 1 if absent
//   changelog-section.mts v2.14.5 --check   prints "ready" or "missing", exit 0
//
// --check never fails, because a release with no notes is a legitimate
// outcome and the workflow decides what to say about it.
if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const { readFileSync } = await import("node:fs");
  const version = process.argv[2];
  if (!version) {
    process.stderr.write("usage: changelog-section.mts <version> [--check]\n");
    process.exit(2);
  }
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const section = extractSection(changelog, version);
  if (process.argv[3] === "--check") {
    process.stdout.write(section ? "ready\n" : "missing\n");
  } else if (section) {
    process.stdout.write(`${section}\n`);
  } else {
    process.exit(1);
  }
}
