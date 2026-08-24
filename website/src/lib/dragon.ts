// Champion and augment names/icons from the same public sources the desktop
// app uses. Cached in localStorage for a day so repeat visits skip the fetch.

export interface ChampionInfo {
  name: string;
}

export interface AugmentInfo {
  name: string;
  desc: string;
  iconPath: string;
  rarity: string;
}

export type ChampionData = Record<number, ChampionInfo>;
export type AugmentData = Record<number, AugmentInfo>;

export const CHAMPION_ICON_URL = (id: number): string =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

export const AUGMENT_ICON_BASE = "https://raw.communitydragon.org/latest/game/";

export function augmentIconUrl(iconPath: string): string {
  if (!iconPath) return "";
  return (
    AUGMENT_ICON_BASE +
    iconPath.replace("/lol-game-data/assets/", "").replace("small", "large").toLowerCase()
  );
}

const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (typeof at !== "number" || Date.now() - at > CACHE_TTL) return null;
    return data as T;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Storage full or unavailable — caching is best-effort
  }
}

export async function loadChampionData(): Promise<ChampionData> {
  const cached = readCache<ChampionData>("champion-data");
  if (cached) return cached;

  const versions = (await (
    await fetch("https://ddragon.leagueoflegends.com/api/versions.json")
  ).json()) as string[];
  const data = await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`)
  ).json();

  const out: ChampionData = {};
  for (const champ of Object.values<any>(data.data)) {
    out[parseInt(champ.key)] = { name: champ.name };
  }
  writeCache("champion-data", out);
  return out;
}

export async function loadAugmentData(): Promise<AugmentData> {
  const cached = readCache<AugmentData>("augment-data");
  if (cached) return cached;

  const data = await (
    await fetch(
      "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json",
    )
  ).json();

  const out: AugmentData = {};
  if (Array.isArray(data)) {
    for (const aug of data) {
      out[aug.id] = {
        name: aug.name || aug.nameTRA || `Augment ${aug.id}`,
        desc: aug.desc || aug.descriptionTRA || "",
        iconPath: aug.augmentSmallIconPath || aug.iconSmall || aug.iconLarge || "",
        rarity: aug.rarity || "",
      };
    }
  }
  writeCache("augment-data", out);
  return out;
}

export function getChampionName(data: ChampionData, id: number): string {
  return data[id]?.name || `Champion ${id}`;
}

export function getAugmentName(data: AugmentData, id: number): string {
  return data[id]?.name || `Augment ${id}`;
}

// ---- Items ----

export interface ItemInfo {
  name: string;
  iconPath: string;
  // Builds into nothing and isn't a consumable — a finished purchase, so
  // build paths can skip components and potions
  completed?: boolean;
}

export type ItemData = Record<number, ItemInfo>;

export function itemIconUrl(iconPath: string): string {
  if (!iconPath) return "";
  return (
    "https://raw.communitydragon.org/latest/game/" +
    iconPath.replace("/lol-game-data/assets/", "").toLowerCase()
  );
}

// items.json is a few MB, so it's loaded only when a champion detail view
// needs it, reduced to id → {name, icon}, and cached like the others.
let itemPromise: Promise<ItemData> | null = null;

export function loadItemData(): Promise<ItemData> {
  if (itemPromise) return itemPromise;
  itemPromise = (async () => {
    const cached = readCache<ItemData>("item-data-v4");
    if (cached) return cached;

    const data = await (
      await fetch(
        "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json",
      )
    ).json();

    const out: ItemData = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        const buildsInto = Array.isArray(item.to) ? item.to.length : 0;
        const categories: string[] = Array.isArray(item.categories) ? item.categories : [];
        const price: number = item.priceTotal ?? 0;
        // Mode-specific prismatics (six-digit ids) count regardless of price.
        // Tier-2 boots upgrade into tier-3, so they build into something while
        // still being a real build step — include them by price instead.
        const builtFrom = Array.isArray(item.from) ? item.from.length : 0;
        // Tier-2 boots upgrade into tier-3, so they build into something while
        // still being a real purchase. What separates them from the 300g
        // Boots everyone starts with is that they are built *from* it —
        // price alone dropped Ionian Boots of Lucidity, at 900g, off the list.
        const completed =
          (buildsInto === 0 && !categories.includes("Consumable") &&
            (price >= 500 || item.id >= 100000)) ||
          (categories.includes("Boots") && builtFrom > 0);
        out[item.id] = {
          name: item.name || `Item ${item.id}`,
          iconPath: item.iconPath || "",
          completed,
        };
      }
    }
    writeCache("item-data-v4", out);
    return out;
  })();
  itemPromise.catch(() => {
    itemPromise = null;
  });
  return itemPromise;
}

export function getItemName(data: ItemData, id: number): string {
  return data[id]?.name || `Item ${id}`;
}

// Whether an item belongs in a build list. Components — Recurve Bow, Giant's
// Belt, Ruby Crystal — carry a win rate because they sat in someone's
// inventory at the final whistle, not because anyone set out to build them,
// and they crowd out the items that were the plan.
//
// The test is `completed`, which asks whether an item builds into anything,
// so it keeps the items that only look like components: Manamune and
// Archangel's Staff *transform* into Muramana and Seraph's Embrace, which the
// item data models as separate items rather than a recipe, leaving both
// halves finished. Tier-2 boots are the one real recipe kept, by price.
//
// An id the item data doesn't know is treated as finished: a missing entry is
// a gap in what we loaded, and hiding real data over it is the worse mistake.
export function isFinishedItem(data: ItemData, id: number): boolean {
  const item = data[id];
  return item ? item.completed === true : true;
}
