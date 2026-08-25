import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareVersions, highestRelease, nextVersion } from "../.github/scripts/next-version.mts";

describe("compareVersions", () => {
  it("orders by number, not by string", () => {
    // The trap this exists to avoid: "2.9.0" sorts after "2.10.0" as text, so
    // a string sort would pick 2.9.0 as the newest release and re-cut versions
    // that already shipped.
    assert.ok(compareVersions("2.10.0", "2.9.0") > 0);
    assert.ok(compareVersions("2.14.10", "2.14.9") > 0);
    assert.ok(compareVersions("10.0.0", "9.99.99") > 0);
  });

  it("treats equal versions as equal", () => {
    assert.equal(compareVersions("2.14.0", "2.14.0"), 0);
  });
});

describe("highestRelease", () => {
  it("finds the newest of a real tag list", () => {
    assert.equal(highestRelease(["v2.9.3", "v2.14.0", "v2.10.2", "v2.13.0", "v2.12.9"]), "2.14.0");
  });

  it("ignores tags that aren't three numeric segments", () => {
    assert.equal(highestRelease(["v2.14.0", "v3.0.0-beta", "nightly", "v2.1"]), "2.14.0");
  });

  it("tolerates the blank line a git tag listing ends with", () => {
    assert.equal(highestRelease(["v2.13.0", "v2.14.0", ""]), "2.14.0");
  });

  it("is null when nothing has ever been released", () => {
    assert.equal(highestRelease([]), null);
  });
});

describe("nextVersion", () => {
  const TAGS = ["v2.13.0", "v2.14.0"];

  it("takes the next patch when package.json is the version already out", () => {
    assert.deepEqual(nextVersion("2.14.0", TAGS), { version: "2.14.1", bump: true });
  });

  it("rolls the patch past nine rather than stopping at it", () => {
    assert.deepEqual(nextVersion("2.14.9", ["v2.14.9"]), { version: "2.14.10", bump: true });
  });

  it("ships a deliberate minor bump as written, with nothing to write back", () => {
    assert.deepEqual(nextVersion("2.15.0", TAGS), { version: "2.15.0", bump: false });
  });

  it("ships a deliberate major bump the same way", () => {
    assert.deepEqual(nextVersion("3.0.0", TAGS), { version: "3.0.0", bump: false });
  });

  it("never goes backwards when package.json lags the tags", () => {
    // Shouldn't happen, but a botched revert of a bump commit would do it, and
    // re-cutting 2.13.1 over a released 2.14.0 would strand every player who
    // already has the newer build.
    assert.deepEqual(nextVersion("2.13.0", TAGS), { version: "2.14.1", bump: true });
  });

  it("ships package.json as-is on a repository with no releases yet", () => {
    assert.deepEqual(nextVersion("1.0.0", []), { version: "1.0.0", bump: false });
  });

  it("refuses a version it cannot reason about", () => {
    assert.throws(() => nextVersion("2.14", TAGS), /not x\.y\.z/);
    assert.throws(() => nextVersion("2.15.0-rc.1", TAGS), /not x\.y\.z/);
  });
});
