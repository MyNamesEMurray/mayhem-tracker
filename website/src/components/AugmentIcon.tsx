import { AUGMENT_DESCRIPTIONS } from "../../../src/shared/augment-descriptions.ts";
import { augmentIconUrl, getAugmentName, type AugmentData } from "../lib/dragon";
import { useTooltip } from "../lib/useTooltip";

const rarityBorder: Record<string, string> = {
  kSilver: "ring-1 ring-gray-400/60",
  kGold: "ring-1 ring-yellow-500/70",
  kPrismatic: "ring-1 ring-fuchsia-400/80",
};

const rarityTextColor: Record<string, string> = {
  kSilver: "text-gray-300",
  kGold: "text-yellow-400",
  kPrismatic: "text-fuchsia-400",
};

const rarityLabel: Record<string, string> = {
  kSilver: "Silver",
  kGold: "Gold",
  kPrismatic: "Prismatic",
};

export default function AugmentIcon({
  augmentData,
  augmentId,
  size = 28,
  showName = false,
  wrap = false,
}: {
  augmentData: AugmentData;
  augmentId: number;
  size?: number;
  showName?: boolean;
  // Wrap long names onto a second line instead of truncating — for layouts
  // where the full name matters more than a fixed row height
  wrap?: boolean;
}) {
  const aug = augmentData[augmentId];
  // Icons are often shown without a name — a champion page's best-augments
  // list, a build row — so the tooltip carries the name and rarity whether or
  // not a description exists for the augment.
  const description = AUGMENT_DESCRIPTIONS[augmentId];
  const nameColor = rarityTextColor[aug?.rarity ?? ""] || "text-lol-text-bright";

  const { triggerProps, tooltip } = useTooltip<HTMLDivElement>(
    aug && (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-xs font-semibold ${nameColor}`}>
            {getAugmentName(augmentData, augmentId)}
          </span>
          {rarityLabel[aug.rarity] && (
            <span className="text-[10px] text-lol-text">{rarityLabel[aug.rarity]}</span>
          )}
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

  const iconUrl = augmentIconUrl(aug.iconPath);
  const borderClass = rarityBorder[aug.rarity] || "";

  return (
    <div className="flex items-center gap-1.5 min-w-0" {...triggerProps}>
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className={`rounded shrink-0 ${borderClass}`}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      {showName && (
        <span className={`text-sm ${wrap ? "leading-snug" : "truncate"} ${nameColor}`}>
          {getAugmentName(augmentData, augmentId)}
        </span>
      )}
      {tooltip}
    </div>
  );
}
