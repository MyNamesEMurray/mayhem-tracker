import type { ItemData, ItemStats } from "./api";

// The core build, as the panel beside a running game needs it.
//
// The champion page and this panel must not disagree about what a champion
// builds, so the ranking itself is neither of these functions: both surfaces
// call rankForBuild on the same list with the same floor. What is here is the
// two steps around it - which items are candidates at all, and which of them
// are already on the character.
//
// That second step is the whole reason the panel is worth reading mid-game.
// The champion page answers "what does this champion build?" with a list.
// Standing at the shop with gold, the question is "what do I buy now?", and
// half of that list is already in the bag.

// Purchases in their own right. A component is what a finished item was on
// the way to rather than something anyone sets out to buy, so it must not
// take one of the six slots in the core.
//
// An id the item data does not know is treated as finished. The mapping
// arrives over the network, and treating an unknown id as a component would
// empty the build while it loads and then fill it in, which reads as the
// recommendation changing its mind.
export function buildCandidates(items: ItemStats[], itemData: ItemData): ItemStats[] {
  return items.filter((i) => itemData[i.item_id]?.completed !== false);
}

export interface LiveBuild {
  // Ranked core items not yet bought, best first. This is the recommendation.
  next: ItemStats[];
  // Core items already carried, in the same ranking order. Progress, not
  // advice - shown so the core reads as a set of six rather than as a list
  // that mysteriously shrinks as the game goes on.
  held: ItemStats[];
}

// Splits a ranked core by what is in the bag right now.
//
// The bag is matched by id, so a component held mid-combine never strikes off
// the item it builds into: the parts and the result are different ids, and
// only the result is ever in the core.
export function splitByHeld(core: ItemStats[], held: Set<number>): LiveBuild {
  return {
    next: core.filter((i) => !held.has(i.item_id)),
    held: core.filter((i) => held.has(i.item_id)),
  };
}
