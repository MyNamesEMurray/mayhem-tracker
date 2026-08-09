import { AugmentIcon } from "mayhem-tracker";

// Real-flavored ARAM Mayhem augments across all three rarities.
// Icon paths are CommunityDragon asset paths — icons render at runtime.
const augmentData = {
  11: {
    name: "Eureka",
    desc: "Gain <scaleAP>10 Ability Power</scaleAP> and refund mana on takedowns.",
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

// One augment per rarity — the name takes the rarity color
export function AllRarities() {
  return (
    <div style={canvas}>
      <AugmentIcon augmentData={augmentData} augmentId={11} showName />
      <AugmentIcon augmentData={augmentData} augmentId={27} showName />
      <AugmentIcon augmentData={augmentData} augmentId={54} showName />
    </div>
  );
}

// Long names in a tight column: default truncates, wrap breaks to two lines
export function TruncateVsWrap() {
  return (
    <div style={{ ...canvas, width: 180 }}>
      <AugmentIcon augmentData={augmentData} augmentId={61} showName />
      <AugmentIcon augmentData={augmentData} augmentId={61} showName wrap />
    </div>
  );
}

// An id missing from augmentData falls back to a plain "Augment N" label
export function MissingAugmentFallback() {
  return (
    <div style={canvas}>
      <AugmentIcon augmentData={augmentData} augmentId={7042} showName />
    </div>
  );
}
