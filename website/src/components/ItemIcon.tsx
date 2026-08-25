import { getItemName, type ItemData } from "../lib/dragon";
import SharedItemIcon from "../../../src/shared/ui/ItemIcon.tsx";

// The site only ever shows the current patch's items, so resolving one is a
// map lookup. The drawing is shared with the desktop app.
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
  wrap?: boolean;
}) {
  return (
    <SharedItemIcon
      itemId={itemId}
      iconPath={itemData[itemId]?.iconPath}
      name={getItemName(itemData, itemId)}
      size={size}
      showName={showName}
      wrap={wrap}
    />
  );
}
