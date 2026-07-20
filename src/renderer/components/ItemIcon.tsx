import { useState, useEffect } from "react";
import { useItemData } from "../hooks/useChampions";
import { CDRAGON_ASSET_URL, ITEM_ICON_URL } from "../lib/constants";

interface ItemIconProps {
  itemId: number;
  size?: number;
  patch?: string | null;
}

export default function ItemIcon({ itemId, size = 24, patch }: ItemIconProps) {
  const itemData = useItemData(patch);
  const [failed, setFailed] = useState(false);

  const item = itemData[itemId];
  const src = item?.iconPath
    ? CDRAGON_ASSET_URL(item.branch, item.iconPath)
    : ITEM_ICON_URL(itemId);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!itemId || itemId === 0 || failed) {
    return (
      <div
        className="rounded bg-white/5 border border-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      title={item?.name}
      width={size}
      height={size}
      className="rounded"
      onError={() => setFailed(true)}
    />
  );
}
