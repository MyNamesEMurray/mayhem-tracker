import type { AugmentData, ChampionData } from "./api";

// Joining what the game says to what the database stores.
//
// The Live Client Data API deals in display names: a champion is "Nunu &
// Willump", an augment reveals itself as a summoner spell called "Ultra
// Hydra". Everything downstream is keyed by number. Riot's own spellings
// differ between the live API, Data Dragon and Community Dragon in
// punctuation and spacing but not in letters, so matching is on the letters.

// Lowercase, letters and digits only. "Nunu & Willump" and "NunuWillump"
// meet here, as do "Kai'Sa" and "Kaisa", and "Bel'Veth" and "Belveth".
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function championIdFromLiveName(
  data: ChampionData,
  championName: string | null | undefined,
): number | null {
  if (!championName) return null;
  const want = normalize(championName);
  if (!want) return null;
  for (const [id, champ] of Object.entries(data)) {
    // Both spellings: the live API sends the display name, but a client that
    // sends the internal one ("MonkeyKing" for Wukong) still lands here
    if (normalize(champ.name) === want || normalize(champ.key) === want) return Number(id);
  }
  return null;
}

// The augments a player has already taken, as ids. A name with no match is
// dropped rather than guessed at: the panel strikes taken augments off the
// board, and striking off the wrong one is worse than striking off none.
export function augmentIdsFromNames(data: AugmentData, names: string[] | undefined): Set<number> {
  const out = new Set<number>();
  if (!names?.length) return out;
  const byName = new Map<string, number>();
  for (const [id, aug] of Object.entries(data)) {
    const key = normalize(aug.name);
    // First id wins. Two augments sharing a normalized name would make this
    // ambiguous, and picking either is a coin flip; keeping the lower id at
    // least makes it the same coin flip every time.
    if (key && !byName.has(key)) byName.set(key, Number(id));
  }
  for (const name of names) {
    const id = byName.get(normalize(name));
    if (id !== undefined) out.add(id);
  }
  return out;
}
