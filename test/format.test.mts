// The shared formatting layer: the numbers and colours that have to read the
// same in the desktop app and on mayhemstats.com.
//
// The performance ramp used to be written out three times — kdaColor and
// scoreRampColor in the app, kdaRampClass on the site — as three chains of
// the same four class names against two sets of thresholds. It is one
// function now, and these tests pin the boundaries each caller depends on.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { formatWhole, KDA_RAMP, kdaRatio, rampClass, SCORE_RAMP } from "../src/shared/format.ts";
import { comparePatches, toClientPatch, toYearPatch } from "../src/shared/patch.ts";
import { QUEUE_LABELS } from "../src/shared/queues.ts";
import * as site from "../website/src/lib/stats.ts";

const AMBER = "text-amber-400";
const SKY = "text-sky-400";
const EMERALD = "text-emerald-400";
const MUTED = "text-lol-text";

describe("the performance ramp", () => {
  test("KDA: amber from 5, sky from 4, emerald from 3, muted below", () => {
    assert.equal(rampClass(9, KDA_RAMP), AMBER);
    assert.equal(rampClass(5, KDA_RAMP), AMBER);
    assert.equal(rampClass(4.99, KDA_RAMP), SKY);
    assert.equal(rampClass(4, KDA_RAMP), SKY);
    assert.equal(rampClass(3.99, KDA_RAMP), EMERALD);
    assert.equal(rampClass(3, KDA_RAMP), EMERALD);
    assert.equal(rampClass(2.99, KDA_RAMP), MUTED);
    assert.equal(rampClass(0, KDA_RAMP), MUTED);
  });

  test("match score: amber from 9, sky from 7, emerald from 5, muted below", () => {
    assert.equal(rampClass(10, SCORE_RAMP), AMBER);
    assert.equal(rampClass(9, SCORE_RAMP), AMBER);
    assert.equal(rampClass(8.9, SCORE_RAMP), SKY);
    assert.equal(rampClass(7, SCORE_RAMP), SKY);
    assert.equal(rampClass(6.9, SCORE_RAMP), EMERALD);
    assert.equal(rampClass(5, SCORE_RAMP), EMERALD);
    assert.equal(rampClass(4.9, SCORE_RAMP), MUTED);
  });

  test("a perfect KDA is amber, not an error", () => {
    assert.equal(rampClass(Infinity, KDA_RAMP), AMBER);
  });

  // NaN fails every >= comparison, which lands on the muted token — the right
  // answer for a value that isn't one, and the same thing the three original
  // if-chains did.
  test("NaN falls through to muted rather than picking a colour", () => {
    assert.equal(rampClass(NaN, KDA_RAMP), MUTED);
    assert.equal(rampClass(NaN, SCORE_RAMP), MUTED);
  });

  test("gold is never a performance colour — it means brand and interaction", () => {
    for (const t of [KDA_RAMP, SCORE_RAMP]) {
      for (let v = -5; v <= 15; v += 0.25) {
        assert.ok(!rampClass(v, t).includes("gold"), `rampClass(${v}) returned a gold token`);
      }
    }
  });
});

describe("shared number formatting", () => {
  test("whole numbers carry a thousands separator", () => {
    assert.equal(formatWhole(50580), (50580).toLocaleString());
    assert.equal(formatWhole(1234.6), (1235).toLocaleString());
  });

  test("a missing number formats as zero rather than NaN", () => {
    assert.equal(formatWhole(null), "0");
    assert.equal(formatWhole(undefined), "0");
  });

  test("KDA floors deaths at one, so a deathless line is a number", () => {
    assert.equal(kdaRatio(10, 0, 5), 15);
    assert.equal(kdaRatio(6, 2, 4), 5);
    assert.equal(kdaRatio(0, 0, 0), 0);
  });
});

describe("patch names", () => {
  test("client versions map to the year-based names we store and show", () => {
    assert.equal(toYearPatch("16.16"), "26.16");
    assert.equal(toYearPatch("26.16"), "26.16", "already year-based — idempotent");
    assert.equal(toClientPatch("26.16"), "16.16");
    assert.equal(toClientPatch("16.16"), "16.16", "already client-style — idempotent");
  });

  test("anything that isn't a patch name passes through untouched", () => {
    assert.equal(toYearPatch("unknown"), "unknown");
    assert.equal(toClientPatch(""), "");
  });

  test("ordering is major then minor, numerically", () => {
    assert.ok(comparePatches("26.9", "26.10") < 0, "26.9 sorts before 26.10, not after");
    assert.ok(comparePatches("26.2", "25.14") > 0);
    assert.equal(comparePatches("26.16", "26.16"), 0);
  });
});

describe("the site reaches for these rather than its own copies", () => {
  test("stats.ts re-exports the shared formatters", () => {
    assert.equal(site.formatWhole, formatWhole);
    assert.equal(site.kdaRatio, kdaRatio);
    assert.equal(site.comparePatches, comparePatches);
    assert.equal(site.QUEUE_LABELS, QUEUE_LABELS);
  });

  test("and colours its KDA column with the shared ramp", () => {
    for (const r of [0, 2.9, 3, 3.9, 4, 4.9, 5, 12]) {
      assert.equal(site.kdaRampClass(r), rampClass(r, KDA_RAMP), `kdaRampClass(${r})`);
    }
  });

  test("and formats patches through the shared conversion", () => {
    assert.equal(site.formatPatch("16.16"), toYearPatch("16.16"));
    assert.equal(site.formatPatch("26.16"), toYearPatch("26.16"));
  });
});
