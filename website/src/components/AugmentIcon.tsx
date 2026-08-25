import { AUGMENT_DESCRIPTIONS } from "../../../src/shared/augment-descriptions.ts";
import { RARITY_LABEL, RARITY_RING, RARITY_TEXT } from "../../../src/shared/ui/rarity.ts";
import { augmentIconUrl, getAugmentName, type AugmentData } from "../lib/dragon";
import { useTooltip } from "../../../src/shared/ui/useTooltip.tsx";

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
  const nameColor = RARITY_TEXT[aug?.rarity ?? ""] || "text-lol-text-bright";

  const { triggerProps, tooltip } = useTooltip<HTMLDivElement>(
    aug && (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-xs font-semibold ${nameColor}`}>
            {getAugmentName(augmentData, augmentId)}
          </span>
          {RARITY_LABEL[aug.rarity] && (
            <span className="text-[10px] text-lol-text">{RARITY_LABEL[aug.rarity]}</span>
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
  const borderClass = RARITY_RING[aug.rarity] || "";

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
