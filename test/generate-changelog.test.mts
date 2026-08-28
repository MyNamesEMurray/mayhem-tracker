// Filling an empty release's section from its commits.
//
// The thing that must never happen here is this clobbering notes someone
// wrote, so that gets tested from several directions. The rest is about not
// telling players things they cannot see: a website-only commit, a version
// bump, a merge commit.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GENERATED_MARKER,
  generateSection,
  insertSection,
  usableCommits,
  type Commit,
} from "../.github/scripts/generate-changelog.mts";

const app = (subject: string): Commit => ({ subject, touchedApp: true });
const site = (subject: string): Commit => ({ subject, touchedApp: false });

describe("usableCommits", () => {
  it("keeps commits that touched the app, in order", () => {
    assert.deepEqual(usableCommits([app("First thing"), app("Second thing")]), [
      "First thing",
      "Second thing",
    ]);
  });

  it("drops work the app does not ship", () => {
    // A merge carrying website and Supabase changes alongside one app fix must
    // not tell players about the parts they cannot see
    assert.deepEqual(usableCommits([site("Restyle the community page"), app("Fix the tab")]), [
      "Fix the tab",
    ]);
  });

  it("drops the workflow's own release commits", () => {
    assert.deepEqual(usableCommits([app("Release v2.14.5"), app("A real change")]), [
      "A real change",
    ]);
  });

  it("drops merge commits", () => {
    const commits = [app("Merge branch 'main' into feature"), app("Merge pull request #12")];
    assert.deepEqual(usableCommits([...commits, app("Real work")]), ["Real work"]);
  });

  it("says a repeated subject once", () => {
    // A rebase or a revert-and-redo can land the same subject twice
    assert.deepEqual(usableCommits([app("Same thing"), app("Same thing")]), ["Same thing"]);
  });

  it("ignores blank subjects", () => {
    assert.deepEqual(usableCommits([app("   "), app("Real")]), ["Real"]);
  });
});

describe("generateSection", () => {
  it("marks itself as generated, so nobody mistakes it for written notes", () => {
    assert.ok(generateSection([app("A change")]).startsWith(GENERATED_MARKER));
  });

  it("hides that marker from players", () => {
    // The release body is rendered as markdown on GitHub and in the app, so
    // the marker has to be a comment rather than visible text
    assert.ok(GENERATED_MARKER.startsWith("<!--") && GENERATED_MARKER.endsWith("-->"));
  });

  it("is empty when nothing is worth listing", () => {
    // Then the caller leaves the changelog alone and the release publishes
    // empty, which is correct for a version whose only commit was a bump
    assert.equal(generateSection([app("Release v2.14.6"), site("Tweak the site")]), "");
    assert.equal(generateSection([]), "");
  });
});

describe("insertSection", () => {
  const CHANGELOG = `# Changelog

How to write these.

## v2.14.5 - 2026-08-28

- **Real notes.** Written by a person.

## v2.14.4 - 2026-08-28

- **Older.** Also written by a person.
`;

  it("never touches a version that already has a section", () => {
    // The whole safety of this feature. A hand-written section always wins.
    assert.equal(insertSection(CHANGELOG, "v2.14.5", "2026-08-29", "- generated"), CHANGELOG);
    assert.equal(insertSection(CHANGELOG, "2.14.5", "2026-08-29", "- generated"), CHANGELOG);
  });

  it("changes nothing when there is no body to insert", () => {
    assert.equal(insertSection(CHANGELOG, "v2.14.6", "2026-08-29", ""), CHANGELOG);
  });

  it("puts a new section above the newest one, below the preamble", () => {
    const out = insertSection(CHANGELOG, "v2.14.6", "2026-08-29", "- generated");
    const headings = [...out.matchAll(/^## (v[\d.]+)/gm)].map((m) => m[1]);
    assert.deepEqual(headings, ["v2.14.6", "v2.14.5", "v2.14.4"]);
    assert.match(out, /^# Changelog/);
    assert.match(out, /How to write these\./);
  });

  it("keeps every earlier section intact", () => {
    const out = insertSection(CHANGELOG, "v2.14.6", "2026-08-29", "- generated");
    assert.match(out, /\*\*Real notes\.\*\* Written by a person\./);
    assert.match(out, /\*\*Older\.\*\* Also written by a person\./);
  });

  it("writes the heading in the house format", () => {
    const out = insertSection(CHANGELOG, "v2.14.6", "2026-08-29", "- generated");
    assert.match(out, /^## v2\.14\.6 - 2026-08-29$/m);
  });

  it("does not let one version answer for a longer one", () => {
    // v2.14.5 existing must not stop v2.14.50 being written
    const out = insertSection(CHANGELOG, "v2.14.50", "2026-08-29", "- generated");
    assert.match(out, /^## v2\.14\.50 - /m);
  });

  it("copes with a changelog that has no versions yet", () => {
    const out = insertSection("# Changelog\n\nPreamble.\n", "v1.0.0", "2026-01-01", "- first");
    assert.match(out, /^## v1\.0\.0 - 2026-01-01$/m);
    assert.match(out, /^# Changelog/);
  });
});
