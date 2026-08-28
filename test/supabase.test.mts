import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patchFilter } from "../src/shared/supabase.ts";

describe("patchFilter", () => {
  it("adds no filter for undefined, which means every patch", () => {
    assert.equal(patchFilter(undefined), "");
  });

  it("names an exact set", () => {
    assert.equal(patchFilter(["26.9"]), "&patch=in.(26.9)");
    assert.equal(patchFilter(["26.9", "26.8", "25.24"]), "&patch=in.(26.9,26.8,25.24)");
  });

  it("selects nothing for an empty set rather than everything", () => {
    // The difference matters: a range covering no patch means no rows. Leaving
    // the filter off would quietly return the whole table instead, which is
    // both wrong and the thing this module exists to stop.
    assert.equal(patchFilter([]), "&patch=in.()");
  });

  it("drops anything that is not a patch name", () => {
    // These reach the URL from a ?patch= parameter, so a value that is not two
    // groups of digits is dropped rather than concatenated into the query.
    assert.equal(patchFilter(["26.9", "26.9)&select=*&x=("]), "&patch=in.(26.9)");
    assert.equal(patchFilter(["../../etc"]), "&patch=in.()");
    assert.equal(patchFilter(["26.9,26.8"]), "&patch=in.()");
  });

  it("keeps a set that is entirely bad from becoming no filter at all", () => {
    // Falling through to "" here would turn a junk range into a full-table
    // fetch, which is the exact regression this replaces
    assert.notEqual(patchFilter(["nonsense"]), "");
  });
});
