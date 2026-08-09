import { ItemIcon } from "mayhem-tracker";

// Icon paths are real CommunityDragon asset paths — icons render at runtime.
const itemData = {
  3089: {
    name: "Rabadon's Deathcap",
    iconPath: "/lol-game-data/assets/ASSETS/Items/Icons2D/3089_WizardsHat_Rabadons.png",
  },
  3031: {
    name: "Infinity Edge",
    iconPath: "/lol-game-data/assets/ASSETS/Items/Icons2D/3031_Marksman_T4_InfinityEdge.png",
  },
  3135: {
    name: "Void Staff",
    iconPath: "/lol-game-data/assets/ASSETS/Items/Icons2D/3135_Mage_T3_VoidStaff.png",
  },
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
      <ItemIcon itemData={itemData} itemId={3089} showName />
      <ItemIcon itemData={itemData} itemId={3031} showName />
      <ItemIcon itemData={itemData} itemId={3135} showName />
    </div>
  );
}

// An id missing from itemData renders a ringed placeholder box and a
// generic "Item N" label — graceful degradation for stale data
export function UnknownItemFallback() {
  return (
    <div style={canvas}>
      <ItemIcon itemData={itemData} itemId={8020} showName />
    </div>
  );
}

// The size prop scales the icon slot: 20 / 28 (default) / 40
export function FallbackSizes() {
  return (
    <div style={{ ...canvas, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <ItemIcon itemData={itemData} itemId={9001} size={20} />
      <ItemIcon itemData={itemData} itemId={9002} size={28} />
      <ItemIcon itemData={itemData} itemId={9003} size={40} />
    </div>
  );
}
