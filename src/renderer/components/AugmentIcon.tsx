import { useAugmentData, getAugmentName } from "../hooks/useChampions";
import { AUGMENT_ICON_BASE } from "../lib/constants";

interface AugmentIconProps {
  augmentId: number;
  size?: number;
  showName?: boolean;
}

// Rarity ring colors from the unified token set: silver #d1d5db, gold
// #facc15, prismatic #e879f9
const rarityBorder: Record<string, string> = {
  kSilver: "ring-1 ring-gray-300/60",
  kGold: "ring-1 ring-yellow-400/70",
  kPrismatic: "ring-1 ring-fuchsia-400/80",
};

const rarityTextColor: Record<string, string> = {
  kSilver: "text-gray-300",
  kGold: "text-yellow-400",
  kPrismatic: "text-fuchsia-400",
};

export function getAugmentRarityLabel(rarity: string): string {
  if (rarity === "kSilver") return "Silver";
  if (rarity === "kGold") return "Gold";
  if (rarity === "kPrismatic") return "Prismatic";
  return "";
}

export default function AugmentIcon({ augmentId, size = 28, showName = false }: AugmentIconProps) {
  const augmentData = useAugmentData();
  const aug = augmentData[augmentId];

  if (!aug) {
    return showName ? <span className="text-xs text-lol-text">Augment {augmentId}</span> : null;
  }

  // CommunityDragon icon paths need to be converted
  const iconUrl = aug.iconPath
    ? AUGMENT_ICON_BASE +
      aug.iconPath.replace("/lol-game-data/assets/", "").replace("small", "large").toLowerCase()
    : "";

  const borderClass = rarityBorder[aug.rarity] || "";
  const nameColor = rarityTextColor[aug.rarity] || "text-lol-text-bright";

  return (
    <div className="flex items-center gap-1.5 min-w-0" title={aug.name}>
      {iconUrl && (
        <img
          src={iconUrl}
          alt={aug.name}
          width={size}
          height={size}
          className={`rounded shrink-0 ${borderClass}`}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      {showName && <span className={`text-xs truncate ${nameColor}`}>{aug.name}</span>}
    </div>
  );
}
