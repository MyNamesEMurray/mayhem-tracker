import { useAugmentData } from "../hooks/useChampions";
import { useTooltip } from "../hooks/useTooltip";
import { AUGMENT_ICON_BASE } from "../lib/constants";
import { AUGMENT_DESCRIPTIONS } from "../../shared/augment-descriptions";

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
  // Most icons are shown without a name — in a scoreboard cell, a match row,
  // a champion's augment list — so the tooltip carries the name and rarity
  // whether or not a description exists for the augment.
  const description = AUGMENT_DESCRIPTIONS[augmentId];
  const rarityLabel = aug ? getAugmentRarityLabel(aug.rarity) : "";
  const nameColor = rarityTextColor[aug?.rarity ?? ""] || "text-lol-text-bright";

  const { triggerProps, tooltip } = useTooltip<HTMLDivElement>(
    aug && (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-xs font-semibold ${nameColor}`}>{aug.name}</span>
          {rarityLabel && <span className="text-[10px] text-lol-text">{rarityLabel}</span>}
        </div>
        {description && (
          <p className="mt-1 text-[11px] leading-snug text-lol-text-bright whitespace-pre-line">
            {description}
          </p>
        )}
      </>
    ),
  );

  if (!aug) {
    return showName ? <span className="text-xs text-lol-text">Augment {augmentId}</span> : null;
  }

  // CommunityDragon icon paths need to be converted
  const iconUrl = aug.iconPath
    ? AUGMENT_ICON_BASE +
      aug.iconPath.replace("/lol-game-data/assets/", "").replace("small", "large").toLowerCase()
    : "";

  const borderClass = rarityBorder[aug.rarity] || "";

  return (
    <div className="flex items-center gap-1.5 min-w-0" {...triggerProps}>
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
      {tooltip}
    </div>
  );
}
