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
