import { ItemIcon } from "mayhem-tracker";

// The component takes a resolved item rather than a lookup table: each surface
// resolves it differently — the app against the patch a game was played on,
// the site against the latest — and the drawing is what they share. Icon paths
// are real CommunityDragon paths, so the art loads at runtime.
const RABADONS = {
  itemId: 3089,
  name: "Rabadon's Deathcap",
  iconPath: "/lol-game-data/assets/ASSETS/Items/Icons2D/3089_WizardsHat_Rabadons.png",
};
const INFINITY_EDGE = {
  itemId: 3031,
  name: "Infinity Edge",
  iconPath: "/lol-game-data/assets/ASSETS/Items/Icons2D/3031_Marksman_T4_InfinityEdge.png",
};
const VOID_STAFF = {
  itemId: 3135,
  name: "Void Staff",
  iconPath: "/lol-game-data/assets/ASSETS/Items/Icons2D/3135_Mage_T3_VoidStaff.png",
};

const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  width: "fit-content",
};

// A champion's core build with names, as shown in the detail view
export function BuildWithNames() {
  return (
    <div style={canvas}>
      <ItemIcon {...RABADONS} showName />
      <ItemIcon {...INFINITY_EDGE} showName />
      <ItemIcon {...VOID_STAFF} showName />
    </div>
  );
}

// An item with no known icon path walks past the legacy mirror to a rimmed
// placeholder, and shows whatever name the caller resolved
export function UnknownItemFallback() {
  return (
    <div style={canvas}>
      <ItemIcon itemId={8020} name="Item 8020" showName />
    </div>
  );
}

// The size prop scales the slot: 20 / 28 / 40. The placeholder holds its
// space, so a row of item slots keeps its shape when one is empty.
export function FallbackSizes() {
  return (
    <div style={{ ...canvas, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <ItemIcon itemId={9001} size={20} />
      <ItemIcon itemId={9002} size={28} />
      <ItemIcon itemId={9003} size={40} />
    </div>
  );
}
