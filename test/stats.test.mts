// The scoring methodology, under test.
//
// Two things are checked here. First, that the formula still produces the
// numbers the source comments and the website's /about/ page promise readers -
// Score is the floor of a 95% Wilson interval, and the whole point of it is
// that sample size moves the number on its own.
//
// Second, that the site still reaches for this module rather than a copy of
// it. The maths lived in two files until src/shared/score.ts merged them, and
// the last suite asserts website/src/lib/stats.ts re-exports these exact
// functions - identity, not equality - so a re-fork fails here rather than
// shipping as a champion that is A-tier on one surface and B on the other.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  assignTiers,
  LIST_MIN_PICKS,
  MIN_SAMPLE,
  rankForBuild,
  score,
  TIER_MIN_SAMPLE,
  TIER_ORDER,
} from "../src/shared/score.ts";
import * as site from "../website/src/lib/stats.ts";

// A spread of records: perfect, thin, losing, even, and proven-over-many.
const RECORDS: [wins: number, games: number][] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [3, 3],
  [5, 5],
  [0, 10],
  [6, 10],
  [10, 10],
  [50, 100],
  [60, 100],
  [600, 1000],
  [1584, 2635],
];

describe("score - the Wilson lower bound", () => {
  // Both figures are quoted in the source comments and on the site.
  test("a perfect 5-0 scores 56.6, because five games cannot rule out a coin flip", () => {
    assert.equal(score(5, 5).toFixed(1), "56.6");
  });

  test("60.1% over 2,635 games scores 58.2, because that many games can", () => {
    assert.equal(((1584 / 2635) * 100).toFixed(1), "60.1");
    assert.equal(score(1584, 2635).toFixed(1), "58.2");
  });

  test("no games scores 0", () => {
    assert.equal(score(0, 0), 0);
    assert.equal(score(0, -1), 0);
  });

  test("evidence beats luck: a proven 60% outranks a perfect 5-0", () => {
    assert.ok(score(1584, 2635) > score(5, 5));
  });

  test("at a fixed rate, the score climbs with the sample", () => {
    const ladder = [score(6, 10), score(60, 100), score(600, 1000), score(6000, 10000)];
    for (let i = 1; i < ladder.length; i++) {
      assert.ok(ladder[i] > ladder[i - 1], `${ladder[i]} should exceed ${ladder[i - 1]}`);
    }
  });

  test("never exceeds the raw win rate - it is a floor, not an estimate", () => {
    for (const [wins, games] of RECORDS) {
      if (games <= 0) continue;
      const rate = (wins / games) * 100;
      assert.ok(score(wins, games) <= rate, `score(${wins}, ${games}) exceeded ${rate}`);
    }
  });

  test("stays inside 0-100", () => {
    for (const [wins, games] of RECORDS) {
      const s = score(wins, games);
      assert.ok(s >= 0 && s <= 100, `score(${wins}, ${games}) = ${s} is out of range`);
    }
  });

  test("an even record scores below 50 - a coin flip proves nothing", () => {
    assert.ok(score(50, 100) < 50);
    assert.ok(score(5000, 10000) < 50);
  });
});

describe("assignTiers - rank percentiles within a cohort", () => {
  // 20 champions, descending strength, deliberately out of order on input.
  const cohort = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    wins: 300 - i * 8,
    games: 500,
  })).reverse();

  const tiers = assignTiers(
    cohort,
    (c) => score(c.wins, c.games),
    (c) => c.id,
  );

  test("every entry gets a tier", () => {
    assert.equal(tiers.size, cohort.length);
    for (const c of cohort) assert.ok(TIER_ORDER.includes(tiers.get(c.id)!));
  });

  test("the best record is S+ and the worst is D, whatever the input order", () => {
    assert.equal(tiers.get(1), "S+");
    assert.equal(tiers.get(20), "D");
  });

  test("tier never improves as score falls", () => {
    const byScore = [...cohort].sort((a, b) => score(b.wins, b.games) - score(a.wins, a.games));
    let last = 0;
    for (const c of byScore) {
      const rank = TIER_ORDER.indexOf(tiers.get(c.id)!);
      assert.ok(rank >= last, `tier improved from ${TIER_ORDER[last]} at champion ${c.id}`);
      last = rank;
    }
  });

  test("the 5% cutoff puts exactly one of twenty in S+", () => {
    const sPlus = [...tiers.values()].filter((t) => t === "S+");
    assert.equal(sPlus.length, 1);
  });

  test("tiers are relative: an all-even cohort still spans S+ to D", () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({ id: i, wins: 50, games: 100 }));
    const flatTiers = assignTiers(
      flat,
      (c) => score(c.wins, c.games),
      (c) => c.id,
    );
    const seen = new Set(flatTiers.values());
    assert.ok(seen.has("S+"));
    assert.ok(seen.has("D"));
  });

  // The top cutoff is the 5th percentile, so the best entry only reaches S+
  // when 1/n <= 0.05. This is why a rarity holding three or four augments
  // never shows an S+ - noted in .design-sync/NOTES.md against AugmentsTable.
  test("a cohort smaller than twenty has no S+ at all", () => {
    for (const n of [3, 12, 19]) {
      const small = Array.from({ length: n }, (_, i) => ({ id: i, wins: 300 - i, games: 500 }));
      const t = assignTiers(
        small,
        (c) => score(c.wins, c.games),
        (c) => c.id,
      );
      assert.ok(![...t.values()].includes("S+"), `a cohort of ${n} produced an S+`);
    }
    const twenty = Array.from({ length: 20 }, (_, i) => ({ id: i, wins: 300 - i, games: 500 }));
    const t20 = assignTiers(
      twenty,
      (c) => score(c.wins, c.games),
      (c) => c.id,
    );
    assert.equal(t20.get(0), "S+");
  });
});

describe("rankForBuild - what a build entry has to earn", () => {
  const items = [
    { id: 1, picks: 5, wins: 5 }, // perfect, but thin
    { id: 2, picks: 300, wins: 174 }, // 58% over hundreds
    { id: 3, picks: 200, wins: 80 }, // losing
    { id: 4, picks: 2, wins: 2 }, // below any floor
    { id: 5, picks: 40, wins: 20 }, // exactly even
    { id: 6, picks: 120, wins: 70 }, // solid
  ];
  const rank = (minPicks: number, count: number) =>
    rankForBuild(
      items,
      (i) => i.picks,
      (i) => i.wins,
      minPicks,
      count,
    ).map((i) => i.id);

  test("drops entries below the pick floor", () => {
    assert.ok(!rank(5, 10).includes(4));
  });

  test("drops losing records, however many picks they have", () => {
    assert.ok(!rank(5, 10).includes(3));
  });

  test("keeps an exactly-even record - the test is 'not losing'", () => {
    assert.ok(rank(5, 10).includes(5));
  });

  // Ranking is by Score, not by raw rate - but Score is a confidence floor, so
  // "more evidence wins" only holds once the evidence is genuinely decisive.
  // A perfect 5-0 scores 56.6; 58% does not overtake it until roughly 4,500
  // games. These two tests pin both halves of that, so a future change to the
  // formula has to be a deliberate one.
  test("a decisive record beats a lucky one: 60.1% over 2,635 tops a perfect 5-0", () => {
    const decisive = [
      { id: 1, picks: 5, wins: 5 },
      { id: 2, picks: 2635, wins: 1584 },
    ];
    const ranked = rankForBuild(
      decisive,
      (i) => i.picks,
      (i) => i.wins,
      5,
      10,
    ).map((i) => i.id);
    assert.deepEqual(ranked, [2, 1]);
  });

  test("a merely-good large record does not: 58% over 300 still sits below a 5-0", () => {
    const ranked = rank(5, 10);
    assert.ok(
      ranked.indexOf(1) < ranked.indexOf(2),
      "58% over 300 scores 52.4 against the 5-0's 56.6 - it needs ~4,500 games to overtake it",
    );
  });

  test("respects the count", () => {
    assert.equal(rank(5, 2).length, 2);
  });

  test("falls short rather than padding with entries that never won", () => {
    // Only two entries clear a 100-pick floor; asking for five yields two.
    assert.equal(rank(100, 5).length, 2);
  });
});

describe("the site uses this module rather than a copy of it", () => {
  test("website/src/lib/stats.ts re-exports these exact functions", () => {
    assert.equal(site.score, score, "stats.ts exports a different score()");
    assert.equal(site.assignTiers, assignTiers, "stats.ts exports a different assignTiers()");
    assert.equal(site.rankForBuild, rankForBuild, "stats.ts exports a different rankForBuild()");
  });

  test("and the same sample floors and tier ladder", () => {
    assert.equal(site.MIN_SAMPLE, MIN_SAMPLE);
    assert.equal(site.TIER_MIN_SAMPLE, TIER_MIN_SAMPLE);
    assert.equal(site.LIST_MIN_PICKS, LIST_MIN_PICKS);
    assert.equal(site.TIER_ORDER, TIER_ORDER, "stats.ts exports a different TIER_ORDER");
  });

  // A safety net for the re-export itself: if someone swaps stats.ts back to a
  // local implementation the identity checks above catch it, but this catches
  // a re-export that resolves to something subtly different.
  test("and produces the same numbers through the site's own entry point", () => {
    for (const [wins, games] of RECORDS) {
      assert.equal(site.score(wins, games), score(wins, games), `score(${wins}, ${games})`);
    }
  });
});
