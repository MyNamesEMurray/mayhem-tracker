import { useItemData } from "../hooks/useChampions";
import SharedItemIcon from "../../shared/ui/ItemIcon";

// The app's item lookup is per-patch: match history draws a game's items from
// the CommunityDragon branch matching the patch it was played on. Resolving
// that is all this does; the drawing is shared with the website.
export default function ItemIcon({
  itemId,
  size = 24,
  patch,
  showName = false,
  wrap = false,
}: {
  itemId: number;
  size?: number;
  patch?: string | null;
  showName?: boolean;
  wrap?: boolean;
}) {
  const itemData = useItemData(patch);
  // Latest-patch data is almost always cached already, so it fills the gap
  // while the per-patch mapping loads (or when that load keeps failing) —
  // item icons rarely change between patches.
  const latestItems = useItemData(null);
  const item = itemData[itemId] ?? (patch ? latestItems[itemId] : undefined);

  return (
    <SharedItemIcon
      itemId={itemId}
      iconPath={item?.iconPath}
      branch={item?.branch}
      name={item?.name}
      size={size}
      showName={showName}
      wrap={wrap}
    />
  );
}
