import { augmentIconUrl, getAugmentName, type AugmentData } from "../lib/dragon";

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

  if (!aug) {
    return showName ? <span className="text-xs text-lol-text">Augment {augmentId}</span> : null;
  }

  const iconUrl = augmentIconUrl(aug.iconPath);
  const borderClass = rarityBorder[aug.rarity] || "";
  const nameColor = rarityTextColor[aug.rarity] || "text-lol-text-bright";

  return (
    <div className="flex items-center gap-1.5 min-w-0" title={aug.desc.replace(/<[^>]+>/g, "")}>
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
        <span
          className={`text-sm ${wrap ? "leading-snug" : "truncate"} ${nameColor}`}
        >
          {getAugmentName(augmentData, augmentId)}
        </span>
      )}
    </div>
  );
}
