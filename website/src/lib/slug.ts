// Champion page slugs: "Miss Fortune" -> "miss-fortune", "Kai'Sa" -> "kaisa",
// "Nunu & Willump" -> "nunu-willump". scripts/prerender.mjs mirrors this —
// keep the two in sync.
export function championSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
