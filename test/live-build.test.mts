// The core build as the in-game panel works it out.
//
// The champion page and this panel must agree on what a champion builds, or
// the same item is a recommendation on one screen and absent from the other.
// The ranking in the middle is therefore the shared rankForBuild, and it is
// called here exactly as the page calls it, so these tests cover the real
// pipeline rather than a convenient half of it. What is genuinely new is the
// two steps around it: which items are candidates, and which are already on
// the character.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCandidates, splitByHeld } from "../src/shared/live-build.ts";
import { rankForBuild } from "../src/shared/score.ts";

const item = (item_id: number, picks: number, wins: number) => ({ item_id, picks, wins });

const itemData = {
  3089: { name: "Rabadon's Deathcap", iconPath: "", branch: "latest", completed: true },
  3157: { name: "Zhonya's Hourglass", iconPath: "", branch: "latest", completed: true },
  3020: { name: "Sorcerer's Shoes", iconPath: "", branch: "latest", completed: true },
  3135: { name: "Void Staff", iconPath: "", branch: "latest", completed: true },
  1026: { name: "Blasting Wand", iconPath: "", branch: "latest", completed: false },
  1058: { name: "Needlessly Large Rod", iconPath: "", branch: "latest", completed: false },
};

// The same numbers Live.tsx uses: a six-slot inventory, and the floor the
// champion page puts under its own core build.
const CORE_SIZE = 6;
const MIN_PICKS = 3;

// The panel's whole pipeline, so a test cannot pass by exercising one end of
// it while the other is broken.
const coreBuild = (
  items: { item_id: number; picks: number; wins: number }[],
  data: typeof itemData | Record<number, never>,
  held: Set<number>,
) =>
  splitByHeld(
    rankForBuild(
      buildCandidates(items, data),
      (i) => i.picks,
      (i) => i.wins,
      MIN_PICKS,
      CORE_SIZE,
    ),
    held,
  );

const ids = (rows: { item_id: number }[]) => rows.map((r) => r.item_id);

const CORE = [item(3089, 100, 62), item(3157, 100, 58), item(3020, 100, 55), item(3135, 100, 53)];

describe("buildCandidates", () => {
  test("leaves components out", () => {
    // A Blasting Wand is what a Deathcap was on the way to, not something
    // anyone sets out to buy, so it must not take a slot in a core of six
    const withParts = [...CORE, item(1026, 500, 300), item(1058, 400, 240)];
    assert.deepEqual(ids(buildCandidates(withParts, itemData)), [3089, 3157, 3020, 3135]);
  });

  test("treats an id the mapping has not loaded as a finished item", () => {
    // The mapping arrives over the network. Treating an unknown id as a
    // component would empty the panel while it loads and then fill it in,
    // which reads as the recommendation changing its mind.
    assert.deepEqual(ids(buildCandidates(CORE, {})), [3089, 3157, 3020, 3135]);
  });
});

describe("the core build the panel draws", () => {
  test("ranks what is left to buy, best first", () => {
    const build = coreBuild(CORE, itemData, new Set());
    assert.deepEqual(ids(build.next), [3089, 3157, 3020, 3135]);
    assert.deepEqual(build.held, []);
  });

  test("moves an item out of the recommendation once it is bought", () => {
    // The whole point of the panel: standing at the shop, a Deathcap you are
    // already holding is not advice
    const build = coreBuild(CORE, itemData, new Set([3089]));
    assert.deepEqual(ids(build.next), [3157, 3020, 3135]);
    assert.deepEqual(ids(build.held), [3089]);
  });

  test("keeps bought items in ranking order, not bag order", () => {
    assert.deepEqual(ids(coreBuild(CORE, itemData, new Set([3135, 3089])).held), [3089, 3135]);
  });

  test("a component in the bag does not strike off the item it builds into", () => {
    // Mid-combine the bag holds the parts, not the result. Reading that as
    // "Deathcap bought" would drop the one item still worth recommending.
    const build = coreBuild(CORE, itemData, new Set([1026, 1058]));
    assert.deepEqual(ids(build.next), [3089, 3157, 3020, 3135]);
    assert.deepEqual(build.held, []);
  });

  test("a full build has nothing left to recommend", () => {
    // Six slots, six items: the honest answer is that you are done, not a
    // seventh item you could never equip
    const six = [...CORE, item(3165, 100, 52), item(3116, 100, 51)];
    const build = coreBuild(six, {}, new Set([3089, 3157, 3020, 3135, 3165, 3116]));
    assert.deepEqual(build.next, []);
    assert.equal(build.held.length, 6);
  });

  test("never offers more than the inventory can hold", () => {
    const many = Array.from({ length: 12 }, (_, n) => item(n + 1, 100, 70 - n));
    const build = coreBuild(many, {}, new Set([1, 2]));
    assert.equal(build.next.length + build.held.length, CORE_SIZE);
    assert.deepEqual(ids(build.next), [3, 4, 5, 6]);
    assert.deepEqual(ids(build.held), [1, 2]);
  });

  test("drops anything too thin to rank", () => {
    const build = coreBuild([item(3089, 2, 2), item(3157, 100, 58)], itemData, new Set());
    assert.deepEqual(ids(build.next), [3157]);
  });

  test("drops an item with a losing record however often it is built", () => {
    // Popularity is not a recommendation, and the champion page applies the
    // same rule to its own core build
    const build = coreBuild([item(3089, 1000, 400), item(3157, 100, 58)], itemData, new Set());
    assert.deepEqual(ids(build.next), [3157]);
  });

  test("says nothing rather than guessing when there is no data", () => {
    const build = coreBuild([], itemData, new Set());
    assert.deepEqual(build.next, []);
    assert.deepEqual(build.held, []);
  });
});
