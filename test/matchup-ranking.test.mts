// Both ends of the same confidence interval.
//
// A matchup list ranked worst-first is where a Wilson lower bound quietly
// does the wrong thing: it sinks a thin sample toward zero, so "struggles
// against" fills with whichever opponents have been met three times and lost
// to, every time. That is noise wearing the shape of a finding, and it is the
// specific failure this pair of functions exists to avoid.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { score, scoreCeiling } from "../src/shared/score.ts";

describe("scoreCeiling", () => {
  test("brackets the observed rate with score", () => {
    for (const [w, g] of [
      [1583, 2635],
      [212, 401],
      [44, 78],
      [5, 5],
      [0, 3],
    ] as const) {
      const rate = (w / g) * 100;
      assert.ok(score(w, g) <= rate + 1e-9, `floor above rate for ${w}/${g}`);
      assert.ok(scoreCeiling(w, g) >= rate - 1e-9, `ceiling below rate for ${w}/${g}`);
    }
  });

  test("the interval narrows as the sample grows", () => {
    const width = (w: number, g: number) => scoreCeiling(w, g) - score(w, g);
    assert.ok(width(3, 5) > width(30, 50));
    assert.ok(width(30, 50) > width(300, 500));
    assert.ok(width(300, 500) > width(3000, 5000));
  });

  test("no games is total ignorance, not certainty", () => {
    // score says 0 (nothing supports any claim) and the ceiling says 100
    // (nothing rules one out). A row with no games must not be able to top
    // either list.
    assert.equal(score(0, 0), 0);
    assert.equal(scoreCeiling(0, 0), 100);
  });
});

describe("ranking a matchup list", () => {
  const rows = [
    { name: "confidently bad", wins: 160, games: 400 },
    { name: "thin and unlucky", wins: 1, games: 8 },
    { name: "confidently good", wins: 250, games: 400 },
    { name: "thin and lucky", wins: 7, games: 8 },
    { name: "even, huge sample", wins: 2000, games: 4000 },
  ];

  test("worst-first by score would put the anecdote first, which is the bug", () => {
    const byScore = [...rows].sort((a, b) => score(a.wins, a.games) - score(b.wins, b.games));
    assert.equal(byScore[0].name, "thin and unlucky");
  });

  test("worst-first by the ceiling puts the real losing matchup first", () => {
    const byCeiling = [...rows].sort(
      (a, b) => scoreCeiling(a.wins, a.games) - scoreCeiling(b.wins, b.games),
    );
    assert.equal(byCeiling[0].name, "confidently bad");
    // An eight-game sample cannot rule out a strong record, so it must not
    // outrank a 400-game one on the bad side
    assert.ok(
      byCeiling.indexOf(rows[1]) > byCeiling.findIndex((r) => r.name === "confidently bad"),
    );
  });

  test("best-first by score still puts the proven winner first", () => {
    const byScore = [...rows].sort((a, b) => score(b.wins, b.games) - score(a.wins, a.games));
    assert.equal(byScore[0].name, "confidently good");
  });
});
