export const CHAMPION_ICON_URL = (id: number): string =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

export const PROFILE_ICON_URL = (id: number): string =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;

export const AUGMENT_ICON_BASE = "https://raw.communitydragon.org/latest/game/";

// Converts a CommunityDragon game-data icon path (e.g. from items.json) to a
// raw asset URL on the given branch ("latest", "pbe", or a patch like "16.14")
export const CDRAGON_ASSET_URL = (branch: string, iconPath: string): string =>
  `https://raw.communitydragon.org/${branch}/game/${iconPath
    .replace("/lol-game-data/assets/", "")
    .toLowerCase()}`;

// Legacy fallback for when the CommunityDragon item mapping is unavailable
export const ITEM_ICON_URL = (itemId: number): string =>
  `https://www.league-of-data-base.com/upload/16.4.1/item_img/${itemId}.png`;

export { QUEUE_ID_MAYHEM, QUEUE_ID_MAYHEM_CLASSIC, QUEUE_LABELS } from "../../shared/queues";
