import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePatchParam,
  patchesIn,
  patchLabel,
  patchParam,
  patchRange,
  type PatchSelection,
} from "../src/shared/patch.ts";

// Newest first, the order both surfaces hand this in, and deliberately
// spanning a major so the ordering traps show up
const PATCHES = ["26.2", "26.1", "25.24", "25.23", "25.10", "25.9"];

describe("parsePatchParam", () => {
  it("reads an absent parameter as the current patch", () => {
    assert.deepEqual(parsePatchParam(null, PATCHES), {
      mode: "current",
      from: "26.2",
      to: "26.2",
    });
  });

  it("reads all", () => {
    assert.equal(parsePatchParam("all", PATCHES).mode, "all");
  });

  it("reads a single patch as a range with equal ends", () => {
    assert.deepEqual(parsePatchParam("25.23", PATCHES), {
      mode: "range",
      from: "25.23",
      to: "25.23",
    });
  });

  it("reads a range", () => {
    assert.deepEqual(parsePatchParam("25.23-26.1", PATCHES), {
      mode: "range",
      from: "25.23",
      to: "26.1",
    });
  });

  it("survives having no patches at all", () => {
    // A fresh install with no games, or the community file failing to load
    assert.deepEqual(parsePatchParam(null, []), { mode: "current", from: "", to: "" });
    assert.equal(patchesIn(parsePatchParam(null, []), []), undefined);
  });
});

describe("patchParam", () => {
  const roundTrip = (param: string | null) => patchParam(parsePatchParam(param, PATCHES), PATCHES);

  it("leaves the parameter off for the current patch", () => {
    assert.equal(patchParam({ mode: "current", from: "26.2", to: "26.2" }, PATCHES), null);
    // ...including a range that happens to be exactly the latest patch, so
    // picking the current patch by hand gives the same link as the default
    assert.equal(patchParam(patchRange("26.2", "26.2"), PATCHES), null);
  });

  it("round-trips every form", () => {
    assert.equal(roundTrip(null), null);
    assert.equal(roundTrip("all"), "all");
    assert.equal(roundTrip("25.23"), "25.23");
    assert.equal(roundTrip("25.23-26.1"), "25.23-26.1");
  });

  it("orders a backwards range rather than producing an empty one", () => {
    // Picking "to" before "from" in the two dropdowns is the ordinary way to
    // build a range, and must not silently select nothing
    assert.equal(patchParam(patchRange("26.1", "25.23"), PATCHES), "25.23-26.1");
  });
});

describe("patchesIn", () => {
  const paramCovers = (param: string | null) => patchesIn(parsePatchParam(param, PATCHES), PATCHES);

  it("covers only the newest patch by default", () => {
    assert.deepEqual(paramCovers(null), ["26.2"]);
  });

  it("does not filter at all for every patch", () => {
    assert.equal(paramCovers("all"), undefined);
  });

  it("covers an inclusive span, both ends included", () => {
    assert.deepEqual(paramCovers("25.23-26.1"), ["26.1", "25.24", "25.23"]);
  });

  it("covers one patch when the ends are equal", () => {
    assert.deepEqual(paramCovers("25.24"), ["25.24"]);
  });

  it("spans a major version boundary", () => {
    // 25.24 to 26.1 is one patch apart in time. Compared as text, "26.1" is
    // below "25.24" on the minor, so a naive comparison drops the span.
    assert.deepEqual(paramCovers("25.24-26.1"), ["26.1", "25.24"]);
  });

  it("orders minor versions by number, not by text", () => {
    // "25.9" sorts after "25.10" as text, which would exclude 25.10 here
    assert.deepEqual(paramCovers("25.9-25.10"), ["25.10", "25.9"]);
  });

  it("takes a backwards range the same way as a forwards one", () => {
    assert.deepEqual(paramCovers("26.1-25.23"), paramCovers("25.23-26.1"));
  });

  it("ignores ends that no longer exist, keeping what is inside them", () => {
    // A shared link can name a patch this install has no games on
    assert.deepEqual(patchesIn(patchRange("25.1", "26.99"), PATCHES), PATCHES);
  });

  it("covers nothing when the span sits entirely outside the data", () => {
    const selection: PatchSelection = patchRange("24.1", "24.9");
    assert.deepEqual(patchesIn(selection, PATCHES), []);
  });
});

describe("patchLabel", () => {
  const forParam = (param: string | null) => patchLabel(parsePatchParam(param, PATCHES), PATCHES);

  it("names a single patch", () => {
    assert.equal(forParam(null), "Patch 26.2");
    assert.equal(forParam("25.23"), "Patch 25.23");
  });

  it("names a span with an en dash, oldest first", () => {
    // Reading order, not the newest-first order the data arrives in
    assert.equal(forParam("25.23-26.1"), "Patches 25.23–26.1");
  });

  it("collapses a span covering one patch to that patch", () => {
    assert.equal(forParam("25.24-25.24"), "Patch 25.24");
  });

  it("names every patch", () => {
    assert.equal(forParam("all"), "All patches");
  });

  it("says nothing when there is nothing to name", () => {
    // A fresh install with no games. "All patches" beside a count of zero
    // reads as a filter that found nothing rather than as an empty database.
    assert.equal(patchLabel(parsePatchParam(null, []), []), "");
  });

  it("says so when a range covers nothing", () => {
    assert.equal(patchLabel(patchRange("24.1", "24.9"), PATCHES), "No patches");
  });
});
