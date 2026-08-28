import { augmentIconUrl } from "../cdn";
import { useAugments } from "./GameData";
import { RARITY_LABEL, RARITY_RING, RARITY_TEXT } from "./rarity";
import { useTooltip } from "./useTooltip";

export default function AugmentIcon({
  augmentId,
  size = 28,
  showName = false,
  wrap = false,
}: {
  augmentId: number;
  size?: number;
  showName?: boolean;
  // Let a long name run onto a second line instead of being cut off, for
  // layouts where the full name matters more than a fixed row height.
  wrap?: boolean;
}) {
  const aug = useAugments()[augmentId];
  // Icons are usually drawn without a name — a scoreboard cell, a match row, a
  // champion's best-augments list — so the tooltip carries the name and rarity
  // whether or not a description exists for the augment.
  //
  // The text arrives on the augment itself, filled in by whichever surface
  // built this map. It used to be a compiled-in map imported here, which meant
  // an augment reworded in a patch kept its old wording until the next release.
  const description = aug?.desc;
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

  const iconUrl = augmentIconUrl(aug.iconPath);

  return (
    <div className="flex items-center gap-1.5 min-w-0" {...triggerProps}>
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className={`rounded shrink-0 ${RARITY_RING[aug.rarity] || ""}`}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      {showName && (
        <span className={`text-sm ${wrap ? "leading-snug" : "truncate"} ${nameColor}`}>
          {aug.name}
        </span>
      )}
      {tooltip}
    </div>
  );
}
