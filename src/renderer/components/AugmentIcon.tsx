import { useAugmentData } from "../hooks/useChampions";
import { useTooltip } from "../../shared/ui/useTooltip";
import { AUGMENT_ICON_BASE } from "../lib/constants";
import { AUGMENT_DESCRIPTIONS } from "../../shared/augment-descriptions";
import { RARITY_LABEL, RARITY_RING, RARITY_TEXT } from "../../shared/ui/rarity";

interface AugmentIconProps {
  augmentId: number;
  size?: number;
  showName?: boolean;
}

export default function AugmentIcon({ augmentId, size = 28, showName = false }: AugmentIconProps) {
  const augmentData = useAugmentData();
  const aug = augmentData[augmentId];
  // Most icons are shown without a name — in a scoreboard cell, a match row,
  // a champion's augment list — so the tooltip carries the name and rarity
  // whether or not a description exists for the augment.
  const description = AUGMENT_DESCRIPTIONS[augmentId];
  const rarityLabel = aug ? (RARITY_LABEL[aug.rarity] ?? "") : "";
  const nameColor = RARITY_TEXT[aug?.rarity ?? ""] || "text-lol-text-bright";

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

  const borderClass = RARITY_RING[aug.rarity] || "";

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
