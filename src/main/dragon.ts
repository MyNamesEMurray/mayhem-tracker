import https from "https";
import fs from "fs";
import path from "path";
import { getDataDir } from "./paths";
import { toClientPatch } from "../shared/patch";
import {
  applyDescriptions,
  AUGMENT_DESCRIPTIONS_URL,
  parseDescriptions,
} from "../shared/augment-descriptions";

let championCache: Record<number, { name: string; key: string; class?: string }> = {};
// Data Dragon version the champion cache came from ("none" until any data
// loads). Folded into the score-backfill key so stored scores recompute when
// champion class data changes.
let championDataVersion = "none";
let augmentCache: Record<number, { name: string; desc: string; iconPath: string; rarity: string }> =
  {};

let championReady: Promise<void> | null = null;
let augmentReady: Promise<void> | null = null;

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "MayhemTracker/1.0" } }, (res) => {
        // Follow redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          fetchJson(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

const championCacheFile = () => path.join(getDataDir(), "champion-cache.json");
const augmentCacheFile = () => path.join(getDataDir(), "augment-cache.json");

// Last successfully fetched champion data, so offline startups still have
// names and classes (and scoring stays consistent with the previous run).
function hydrateChampionCacheFromDisk() {
  try {
    const cached = JSON.parse(fs.readFileSync(championCacheFile(), "utf8"));
    if (cached?.champions && cached?.version) {
      championCache = cached.champions;
      championDataVersion = cached.version;
    }
  } catch {
    // No cache yet, or unreadable — network load will populate it
  }
}

export function loadChampionData() {
  championReady = (async () => {
    hydrateChampionCacheFromDisk();
    try {
      const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
      const version = versions[0];

      const data = await fetchJson(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      );
      const cache: typeof championCache = {};
      for (const [key, champ] of Object.entries(data.data) as any[]) {
        cache[parseInt(champ.key)] = { name: champ.name, key, class: champ.tags?.[0] };
      }
      championCache = cache;
      championDataVersion = version;
      try {
        fs.writeFileSync(championCacheFile(), JSON.stringify({ version, champions: cache }));
      } catch (err) {
        console.error("Failed to persist champion cache:", err);
      }
      console.log(
        `Loaded ${Object.keys(championCache).length} champions from Data Dragon v${version}`,
      );
    } catch (err) {
      console.error("Failed to load champion data:", err);
    }
  })();
  return championReady;
}

// Last successfully fetched augment list and hover text. The list had no
// cache at all before, so an offline start showed "Augment 2141" where a name
// belongs — and the descriptions were compiled in, so they were the one part
// that did survive. Now both do, from here.
function hydrateAugmentCacheFromDisk() {
  try {
    const cached = JSON.parse(fs.readFileSync(augmentCacheFile(), "utf8"));
    if (cached?.augments && Object.keys(cached.augments).length > 0) {
      augmentCache = cached.augments;
    }
  } catch {
    // No cache yet, or unreadable — the network load below will write one
  }
}

// The hover text, published by the site rather than compiled in here. A
// failure leaves whatever the augment list gave us, which is an empty string,
// and the icons hover with a name and no description — the same as an augment
// the string table has no text for.
async function fetchDescriptions(): Promise<Record<string, string> | null> {
  try {
    return parseDescriptions(await fetchJson(AUGMENT_DESCRIPTIONS_URL))?.descriptions ?? null;
  } catch (err) {
    console.error("Failed to load augment descriptions:", err);
    return null;
  }
}

export function loadAugmentData() {
  augmentReady = (async () => {
    hydrateAugmentCacheFromDisk();
    try {
      // Both come off a CDN and neither depends on the other, so they overlap
      const [data, descriptions] = await Promise.all([
        fetchJson(
          "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json",
        ),
        fetchDescriptions(),
      ]);
      augmentCache = {};

      // cherry-augments.json is an array of augment objects
      if (Array.isArray(data)) {
        for (const aug of data) {
          augmentCache[aug.id] = {
            name: aug.name || aug.nameTRA || `Augment ${aug.id}`,
            desc: aug.desc || aug.descriptionTRA || "",
            iconPath: aug.augmentSmallIconPath || aug.iconSmall || aug.iconLarge || "",
            rarity: aug.rarity || "",
          };
        }
      } else if (typeof data === "object") {
        // Could be keyed by id
        for (const [id, aug] of Object.entries(data) as any[]) {
          const numId = parseInt(id);
          if (!isNaN(numId)) {
            augmentCache[numId] = {
              name: aug.name || aug.nameTRA || `Augment ${numId}`,
              desc: aug.desc || aug.descriptionTRA || "",
              iconPath: aug.augmentSmallIconPath || aug.iconSmall || aug.iconLarge || "",
              rarity: aug.rarity || "",
            };
          }
        }
      }

      if (descriptions) applyDescriptions(augmentCache, descriptions);

      try {
        fs.writeFileSync(augmentCacheFile(), JSON.stringify({ augments: augmentCache }));
      } catch (err) {
        console.error("Could not write the augment cache:", err);
      }

      const described = Object.values(augmentCache).filter((a) => a.desc).length;
      console.log(
        `Loaded ${Object.keys(augmentCache).length} augments from CommunityDragon, ${described} with descriptions`,
      );
    } catch (err) {
      console.error("Failed to load augment data:", err);
    }
  })();
  return augmentReady;
}

export type ItemInfo = {
  name: string;
  iconPath: string;
  branch: string;
  // Whether the item is a purchase in its own right rather than a part on the
  // way to one. Build lists show finished items only: a component carries a
  // win rate because it sat in someone's inventory at the final whistle, not
  // because anyone set out to build it. Mirrors website/src/lib/dragon.ts.
  completed: boolean;
};

// An item is finished when it builds into nothing and costs enough to be a
// real purchase — which keeps the ones that only look like components, since
// Manamune and Archangel's Staff transform into Muramana and Seraph's
// Embrace, modelled as separate items rather than a recipe. Mode-specific
// prismatics (six-digit ids) count whatever they cost. Tier-2 boots do build
// into tier-3, so they are kept by being built *from* the 300g starter pair.
function isCompleted(item: any): boolean {
  const buildsInto = Array.isArray(item.to) ? item.to.length : 0;
  const builtFrom = Array.isArray(item.from) ? item.from.length : 0;
  const categories: string[] = Array.isArray(item.categories) ? item.categories : [];
  const price: number = item.priceTotal ?? 0;
  return (
    (buildsInto === 0 &&
      !categories.includes("Consumable") &&
      (price >= 500 || item.id >= 100000)) ||
    (categories.includes("Boots") && builtFrom > 0)
  );
}

const itemCache = new Map<string, Record<number, ItemInfo>>();
const itemPromises = new Map<string, Promise<Record<number, ItemInfo>>>();
let latestLivePatch: string | null = null;

const itemsJsonUrl = (branch: string) =>
  `https://raw.communitydragon.org/${branch}/plugins/rcp-be-lol-game-data/global/default/v1/items.json`;

// Map a game's major.minor patch to the CommunityDragon branch that has its
// data: live patches have their own branch, the current patch is "latest",
// and a patch newer than live only exists on "pbe".
async function resolveItemBranch(patch?: string): Promise<string> {
  if (!patch) return "latest";
  // Stored patches are year-based ("26.16"); CDN branches and DDragon
  // versions use client numbering ("16.16")
  patch = toClientPatch(patch);
  try {
    if (!latestLivePatch) {
      const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
      const m = String(versions[0]).match(/^(\d+)\.(\d+)/);
      if (m) latestLivePatch = `${m[1]}.${m[2]}`;
    }
    if (latestLivePatch) {
      const [liveMajor, liveMinor] = latestLivePatch.split(".").map(Number);
      const [major, minor] = patch.split(".").map(Number);
      if (major > liveMajor || (major === liveMajor && minor > liveMinor)) return "pbe";
      if (major === liveMajor && minor === liveMinor) return "latest";
    }
  } catch {
    /* fall through to the patch's own branch */
  }
  return patch;
}

export function loadItemData(patch?: string): Promise<Record<number, ItemInfo>> {
  const key = patch ?? "latest";
  const cached = itemCache.get(key);
  if (cached) return Promise.resolve(cached);

  let promise = itemPromises.get(key);
  if (!promise) {
    promise = (async () => {
      let branch = await resolveItemBranch(patch);
      let data: any;
      try {
        data = await fetchJson(itemsJsonUrl(branch));
      } catch (err) {
        if (branch === "latest") throw err;
        // Label items with the branch the data actually came from, or the
        // asset URLs built from them would 404 on the unavailable branch
        branch = "latest";
        data = await fetchJson(itemsJsonUrl(branch));
      }
      const items: Record<number, ItemInfo> = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          items[item.id] = {
            name: item.name || "",
            iconPath: item.iconPath || "",
            branch,
            completed: isCompleted(item),
          };
        }
      }
      itemCache.set(key, items);
      console.log(`Loaded ${Object.keys(items).length} items from CommunityDragon (${branch})`);
      return items;
    })();
    // Drop failed loads so a later request can retry
    promise.catch(() => itemPromises.delete(key));
    itemPromises.set(key, promise);
  }
  return promise;
}

export async function waitForChampionData() {
  if (championReady) await championReady;
}

export async function waitForAugmentData() {
  if (augmentReady) await augmentReady;
}

export function getChampionData() {
  return championCache;
}

export function getChampionClasses(): Record<number, string> {
  const map: Record<number, string> = {};
  for (const [id, champ] of Object.entries(championCache)) {
    if (champ.class) map[Number(id)] = champ.class;
  }
  return map;
}

export function getChampionDataVersion() {
  return championDataVersion;
}

export function getAugmentDataCache() {
  return augmentCache;
}
