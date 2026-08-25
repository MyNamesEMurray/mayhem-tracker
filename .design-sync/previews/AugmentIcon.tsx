import { AugmentIcon, GameDataProvider } from "mayhem-tracker";

// Real-flavored ARAM Mayhem augments across all three rarities.
// Icon paths are CommunityDragon asset paths — icons render at runtime.
const augments = {
  11: {
    name: "Eureka",
    desc: "Gain 10 Ability Power and refund mana on takedowns.",
    rarity: "kSilver",
    iconPath: "/lol-game-data/assets/ASSETS/ux/cherry/augments/icons/eureka_small.png",
  },
  27: {
    name: "Infernal Conduit",
    desc: "Your abilities burn enemies for bonus magic damage over 3 seconds.",
    rarity: "kGold",
    iconPath: "/lol-game-data/assets/ASSETS/ux/cherry/augments/icons/infernalconduit_small.png",
  },
  54: {
    name: "Goliath",
    desc: "Grow massive: gain max health, size, and tenacity.",
    rarity: "kPrismatic",
    iconPath: "/lol-game-data/assets/ASSETS/ux/cherry/augments/icons/goliath_small.png",
  },
  61: {
    name: "Quest: Angel of Retribution",
    desc: "Complete the quest to unlock a celestial ultimate.",
    rarity: "kPrismatic",
    iconPath: "/lol-game-data/assets/ASSETS/ux/cherry/augments/icons/angelofretribution_small.png",
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

// Augment names and rarities come from context now rather than a prop, so
// every preview of an augment icon supplies them once at the top.
function Canvas({ children, width }: { children: React.ReactNode; width?: number }) {
  return (
    <GameDataProvider augments={augments}>
      <div style={width ? { ...canvas, width } : canvas}>{children}</div>
    </GameDataProvider>
  );
}

// One augment per rarity — the name takes the rarity color
export function AllRarities() {
  return (
    <Canvas>
      <AugmentIcon augmentId={11} showName />
      <AugmentIcon augmentId={27} showName />
      <AugmentIcon augmentId={54} showName />
    </Canvas>
  );
}

// Long names in a tight column: default truncates, wrap breaks to two lines
export function TruncateVsWrap() {
  return (
    <Canvas width={180}>
      <AugmentIcon augmentId={61} showName />
      <AugmentIcon augmentId={61} showName wrap />
    </Canvas>
  );
}

// An id the context doesn't know falls back to a plain "Augment N" label
export function MissingAugmentFallback() {
  return (
    <Canvas>
      <AugmentIcon augmentId={7042} showName />
    </Canvas>
  );
}
