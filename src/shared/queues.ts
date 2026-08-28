export const QUEUE_ID_MAYHEM = 2400;
export const QUEUE_ID_MAYHEM_CLASSIC = 2450;

export const MAYHEM_QUEUE_IDS = [QUEUE_ID_MAYHEM, QUEUE_ID_MAYHEM_CLASSIC];

export const QUEUE_LABELS: Record<number, string> = {
  [QUEUE_ID_MAYHEM]: "ARAM Mayhem",
  [QUEUE_ID_MAYHEM_CLASSIC]: "Mayhem Classic",
};

// Four picked at level breakpoints, plus up to two bonus slots for special augments
export const AUGMENT_SLOTS = 6;

// Which queue a reading of the community stats should filter on, given what
// the running game reports and what the board is set to.
//
// The point of naming this is the return type: a number, never undefined.
// Undefined means every queue downstream, and the two Mayhem queues have all
// but disjoint item pools - Classic carries its own 77xxxx range of the same
// items, sharing exactly one id with ARAM Mayhem across the whole database -
// so a read spanning both offers a Classic Rabadon's for a Mayhem game.
//
// That is not hypothetical. The in-game panel took its queue straight from
// the shared board filter, which is undefined while it reads its default and
// stays undefined when the board is set to All, so the panel mixed the two
// pools on every first paint and permanently for anyone browsing All.
//
// The running game is the authority, because the panel is about the game
// being played rather than about whatever the tier list was last set to. When
// the client cannot say, the board's choice is a reasonable guess, and the
// app's own default is the floor.
export function statsQueue(live: number | null | undefined, board: number | undefined): number {
  return live ?? board ?? QUEUE_ID_MAYHEM;
}
