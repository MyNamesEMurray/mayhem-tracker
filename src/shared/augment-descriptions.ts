// Where augment hover text comes from, for both surfaces.
//
// The text is not in the augment list Riot publishes — that carries names,
// icons and rarities, and its description field is always empty. The only
// place it exists is the game's own string table, which is ~33 MB, so
// scripts/gen-augment-descriptions.mjs resolves it once and writes the result
// to website/public/augment-descriptions.json.
//
// Both surfaces then fetch that file, the same way they already fetch the
// augment list, the champion list and the item data. It used to be compiled
// into each instead, which meant a patch rewording an augment reached players
// only when someone cut a release and everyone downloaded a hundred megabytes
// — for a few sentences of text. The app already showed a new augment's name,
// icon and rarity the day it appeared, because those are fetched; only the
// description waited.

// Same-origin on the site. The app passes the absolute URL, since it has no
// origin of its own.
export const AUGMENT_DESCRIPTIONS_PATH = "/augment-descriptions.json";
export const AUGMENT_DESCRIPTIONS_URL = `https://mayhemstats.com${AUGMENT_DESCRIPTIONS_PATH}`;

export interface AugmentDescriptions {
  // The Data Dragon patch the text was generated from
  patch: string;
  // Augment id to description. Ids are strings because JSON object keys are.
  descriptions: Record<string, string>;
}

// Reads a parsed response, or null if it is not the shape we published. The
// file comes off a CDN, so a cached error page or a half-written deploy is
// worth failing closed on rather than rendering as tooltips.
export function parseDescriptions(raw: unknown): AugmentDescriptions | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { patch, descriptions } = raw as Partial<AugmentDescriptions>;
  if (typeof patch !== "string" || typeof descriptions !== "object" || descriptions === null) {
    return null;
  }
  // One bad value shouldn't discard the whole file, but a file that is all bad
  // values is not the file we meant to publish
  const clean: Record<string, string> = {};
  for (const [id, text] of Object.entries(descriptions)) {
    if (typeof text === "string" && text) clean[id] = text;
  }
  return Object.keys(clean).length > 0 ? { patch, descriptions: clean } : null;
}

// Fills in the desc field on an augment map already built from the augment
// list. Augments with no text — a handful genuinely have none — keep whatever
// they had, which is the empty string upstream gave them, and hover without a
// description.
export function applyDescriptions<T extends { desc?: string }>(
  augments: Record<number, T>,
  descriptions: Record<string, string>,
): Record<number, T> {
  for (const [id, text] of Object.entries(descriptions)) {
    const aug = augments[Number(id)];
    if (aug) aug.desc = text;
  }
  return augments;
}
