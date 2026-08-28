import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyDescriptions,
  AUGMENT_DESCRIPTIONS_PATH,
  AUGMENT_DESCRIPTIONS_URL,
  parseDescriptions,
} from "../src/shared/augment-descriptions.ts";

describe("parseDescriptions", () => {
  it("reads the file we publish", () => {
    const parsed = parseDescriptions({ patch: "16.17", descriptions: { "1": "Text." } });
    assert.deepEqual(parsed, { patch: "16.17", descriptions: { "1": "Text." } });
  });

  it("drops entries that are not text, keeping the rest", () => {
    const parsed = parseDescriptions({
      patch: "16.17",
      descriptions: { "1": "Text.", "2": null, "3": 42, "4": "" },
    });
    assert.deepEqual(parsed?.descriptions, { "1": "Text." });
  });

  // The file comes off a CDN, where a cached error page or a half-written
  // deploy can arrive with a 200. Rendering that as tooltips would be worse
  // than showing none, so anything unrecognisable fails closed.
  for (const [label, raw] of [
    ["null", null],
    ["a string", "not json we published"],
    ["an array", []],
    ["an error page parsed as JSON", { error: "not found" }],
    ["no patch", { descriptions: { "1": "Text." } }],
    ["no descriptions", { patch: "16.17" }],
    ["descriptions that are all unusable", { patch: "16.17", descriptions: { "1": 42 } }],
    ["an empty map", { patch: "16.17", descriptions: {} }],
  ] as const) {
    it(`refuses ${label}`, () => {
      assert.equal(parseDescriptions(raw), null);
    });
  }
});

describe("applyDescriptions", () => {
  const augments = () => ({
    1: { name: "Accelerating Sorcery", desc: "" },
    2: { name: "Apex Inventor", desc: "" },
  });

  it("fills in the text for the augments it knows", () => {
    const out = applyDescriptions(augments(), { "1": "Stacking Ability Haste." });
    assert.equal(out[1].desc, "Stacking Ability Haste.");
  });

  it("leaves an augment with no text alone", () => {
    // A handful genuinely have none anywhere in the string table
    const out = applyDescriptions(augments(), { "1": "Text." });
    assert.equal(out[2].desc, "");
  });

  it("ignores text for an augment the list does not have", () => {
    // The published file can be a patch ahead of the augment list, or behind
    const out = applyDescriptions(augments(), { "9999": "Text." });
    assert.deepEqual(Object.keys(out), ["1", "2"]);
  });
});

describe("the published file", () => {
  const published = JSON.parse(
    readFileSync(new URL("../website/public/augment-descriptions.json", import.meta.url), "utf8"),
  );

  it("is the shape both surfaces parse", () => {
    const parsed = parseDescriptions(published);
    assert.ok(parsed, "the file we ship must survive our own parser");
    assert.ok(Object.keys(parsed.descriptions).length > 500, "should hold hundreds of augments");
  });

  it("is served from the path the site fetches and the URL the app fetches", () => {
    // website/public is copied to the site root verbatim, so the file's path
    // under it is the path it is served at
    assert.equal(AUGMENT_DESCRIPTIONS_PATH, "/augment-descriptions.json");
    assert.ok(AUGMENT_DESCRIPTIONS_URL.endsWith(AUGMENT_DESCRIPTIONS_PATH));
  });
});
