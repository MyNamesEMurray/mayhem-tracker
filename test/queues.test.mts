// Which queue a stats read filters on.
//
// This is a three-term expression, and it is tested because getting it wrong
// is invisible rather than loud: the two Mayhem queues carry all but disjoint
// item pools, so a read that resolves to "every queue" does not fail, it just
// quietly offers a Mayhem Classic item for an ARAM Mayhem game.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  QUEUE_ID_MAYHEM,
  QUEUE_ID_MAYHEM_CLASSIC,
  MAYHEM_QUEUE_IDS,
  statsQueue,
} from "../src/shared/queues.ts";

describe("statsQueue", () => {
  test("is never undefined, whatever it is given", () => {
    // The property the whole thing exists for. Undefined means every queue
    // downstream, and every queue is what mixed the two item pools.
    for (const live of [undefined, null, QUEUE_ID_MAYHEM, QUEUE_ID_MAYHEM_CLASSIC]) {
      for (const board of [undefined, QUEUE_ID_MAYHEM, QUEUE_ID_MAYHEM_CLASSIC]) {
        const out = statsQueue(live, board);
        assert.equal(typeof out, "number", `live=${live} board=${board} produced ${out}`);
        assert.ok(MAYHEM_QUEUE_IDS.includes(out), `${out} is not a Mayhem queue`);
      }
    }
  });

  test("the running game wins over the board", () => {
    // Playing Classic while the tier list is set to Mayhem must read Classic:
    // the panel is about the game in front of you
    assert.equal(statsQueue(QUEUE_ID_MAYHEM_CLASSIC, QUEUE_ID_MAYHEM), QUEUE_ID_MAYHEM_CLASSIC);
    assert.equal(statsQueue(QUEUE_ID_MAYHEM, QUEUE_ID_MAYHEM_CLASSIC), QUEUE_ID_MAYHEM);
  });

  test("falls back to the board when the client cannot say", () => {
    assert.equal(statsQueue(null, QUEUE_ID_MAYHEM_CLASSIC), QUEUE_ID_MAYHEM_CLASSIC);
    assert.equal(statsQueue(undefined, QUEUE_ID_MAYHEM_CLASSIC), QUEUE_ID_MAYHEM_CLASSIC);
  });

  test("a board set to All is not an answer", () => {
    // The actual bug: All is undefined, undefined is every queue, and every
    // queue is both pools at once
    assert.equal(statsQueue(null, undefined), QUEUE_ID_MAYHEM);
  });

  test("the game's queue survives a board set to All", () => {
    assert.equal(statsQueue(QUEUE_ID_MAYHEM_CLASSIC, undefined), QUEUE_ID_MAYHEM_CLASSIC);
  });
});
