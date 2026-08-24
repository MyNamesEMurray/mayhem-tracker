import { getItemName, itemIconUrl, type ItemData } from "../lib/dragon";

export default function ItemIcon({
  itemData,
  itemId,
  size = 28,
  showName = false,
  wrap = false,
}: {
  itemData: ItemData;
  itemId: number;
  size?: number;
  showName?: boolean;
  // Let a long name run to a second line rather than be cut off. Table rows
  // grow a little; "Overlord's Bloodmail" stays readable on a phone.
  wrap?: boolean;
}) {
  const item = itemData[itemId];
  const iconUrl = item ? itemIconUrl(item.iconPath) : "";
  const name = getItemName(itemData, itemId);

  return (
    <div className="flex items-center gap-1.5 min-w-0" title={name}>
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="rounded shrink-0 ring-1 ring-lol-border"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span
          className="rounded shrink-0 ring-1 ring-lol-border bg-lol-dark inline-block"
          style={{ width: size, height: size }}
        />
      )}
      {showName && (
        <span className={`text-sm text-lol-text-bright ${wrap ? "leading-snug" : "truncate"}`}>
          {name}
        </span>
      )}
    </div>
  );
}
