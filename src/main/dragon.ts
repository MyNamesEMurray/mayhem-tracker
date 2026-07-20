import https from "https";

let championCache: Record<number, { name: string; key: string }> = {};
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

export function loadChampionData() {
  championReady = (async () => {
    try {
      const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
      const version = versions[0];

      const data = await fetchJson(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      );
      championCache = {};
      for (const [key, champ] of Object.entries(data.data) as any[]) {
        championCache[parseInt(champ.key)] = { name: champ.name, key };
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

export function loadAugmentData() {
  augmentReady = (async () => {
    try {
      const data = await fetchJson(
        "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json",
      );
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

      console.log(`Loaded ${Object.keys(augmentCache).length} augments from CommunityDragon`);
    } catch (err) {
      console.error("Failed to load augment data:", err);
    }
  })();
  return augmentReady;
}

export type ItemInfo = { name: string; iconPath: string; branch: string };

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
      const branch = await resolveItemBranch(patch);
      let data: any;
      try {
        data = await fetchJson(itemsJsonUrl(branch));
      } catch (err) {
        if (branch === "latest") throw err;
        data = await fetchJson(itemsJsonUrl("latest"));
      }
      const items: Record<number, ItemInfo> = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          items[item.id] = { name: item.name || "", iconPath: item.iconPath || "", branch };
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

export function getAugmentDataCache() {
  return augmentCache;
}
