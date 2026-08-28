import { AugmentsTable } from "mayhem-tracker";

// AugmentStatRow is per augment x champion; the table aggregates across
// champions. kills/deaths/assists/damage are TOTALS, so per-game averages
// are multiplied out. Icons load from CommunityDragon at runtime.
const aug = (
  augment_id: number,
  champion_id: number,
  picks: number,
  wins: number,
  k: number,
  d: number,
  a: number,
  dmg: number,
) => ({
  patch: "16.15",
  queue_id: 2400,
  augment_id,
  champion_id,
  picks,
  wins,
  kills: Math.round(k * picks),
  deaths: Math.round(d * picks),
  assists: Math.round(a * picks),
  damage: Math.round(dmg * picks),
});

// 15 augments across the three rarities so the per-rarity tier ranking shows
// a real S..D spread. Two low-sample entries (Ethereal Weapon, Blunt Force)
// exercise the asterisk / 20+ filter path.
const rows = [
  // Prismatic
  aug(901, 101, 88, 56, 4.2, 5.8, 15.5, 22000), // Goliath - Malzahar
  aug(901, 53, 82, 50, 4.2, 5.8, 15.5, 22000), // Goliath - Blitzcrank
  aug(901, 22, 70, 40, 4.2, 5.8, 15.5, 22000), // Goliath - Ashe
  aug(902, 45, 68, 40, 8.6, 5.6, 12.4, 43000), // Eureka - Veigar
  aug(902, 99, 62, 34, 8.6, 5.6, 12.4, 43000), // Eureka - Lux
  aug(902, 115, 55, 30, 8.6, 5.6, 12.4, 43000), // Eureka - Ziggs
  aug(903, 157, 7, 5, 9.4, 5.2, 10.1, 46500), // Ethereal Weapon - Yasuo (low sample)
  aug(903, 21, 5, 3, 9.4, 5.2, 10.1, 46500), // Ethereal Weapon - Miss Fortune
  aug(904, 45, 56, 31, 9.1, 6.3, 11.2, 41000), // Jeweled Gauntlet - Veigar
  aug(904, 99, 52, 28, 9.1, 6.3, 11.2, 41000), // Jeweled Gauntlet - Lux
  aug(904, 115, 44, 23, 9.1, 6.3, 11.2, 41000), // Jeweled Gauntlet - Ziggs
  // Gold
  aug(501, 101, 78, 46, 8.2, 5.9, 12.0, 40500), // Infernal Conduit - Malzahar
  aug(501, 99, 70, 39, 8.2, 5.9, 12.0, 40500), // Infernal Conduit - Lux
  aug(501, 115, 62, 33, 8.2, 5.9, 12.0, 40500), // Infernal Conduit - Ziggs
  aug(502, 22, 60, 33, 6.4, 6.1, 13.8, 34000), // Frost Wraith - Ashe
  aug(502, 99, 55, 29, 6.4, 6.1, 13.8, 34000), // Frost Wraith - Lux
  aug(502, 21, 50, 25, 6.4, 6.1, 13.8, 34000), // Frost Wraith - Miss Fortune
  aug(503, 222, 52, 27, 9.8, 6.6, 8.9, 36500), // Executioner - Jinx
  aug(503, 21, 48, 24, 9.8, 6.6, 8.9, 36500), // Executioner - Miss Fortune
  aug(503, 157, 42, 20, 9.8, 6.6, 8.9, 36500), // Executioner - Yasuo
  aug(504, 157, 38, 18, 7.6, 7.2, 9.4, 29500), // Spin to Win - Yasuo
  aug(504, 222, 34, 15, 7.6, 7.2, 9.4, 29500), // Spin to Win - Jinx
  aug(504, 21, 26, 12, 7.6, 7.2, 9.4, 29500), // Spin to Win - Miss Fortune
  aug(505, 222, 48, 23, 8.4, 6.9, 9.8, 33000), // Lightning Strikes - Jinx
  aug(505, 21, 44, 21, 8.4, 6.9, 9.8, 33000), // Lightning Strikes - Miss Fortune
  aug(505, 157, 36, 16, 8.4, 6.9, 9.8, 33000), // Lightning Strikes - Yasuo
  aug(506, 53, 48, 23, 5.2, 6.6, 13.1, 21000), // Dawnbringer's Resolve - Blitzcrank
  aug(506, 101, 40, 17, 5.2, 6.6, 13.1, 21000), // Dawnbringer's Resolve - Malzahar
  aug(507, 45, 60, 28, 7.8, 6.7, 10.4, 32000), // Keystone Conjurer - Veigar
  aug(507, 115, 52, 23, 7.8, 6.7, 10.4, 32000), // Keystone Conjurer - Ziggs
  // Silver
  aug(201, 22, 64, 35, 8.9, 6.0, 10.6, 35500), // Scoped Weapons - Ashe
  aug(201, 222, 60, 32, 8.9, 6.0, 10.6, 35500), // Scoped Weapons - Jinx
  aug(201, 21, 51, 26, 8.9, 6.0, 10.6, 35500), // Scoped Weapons - Miss Fortune
  aug(202, 53, 48, 24, 6.2, 6.4, 12.6, 27000), // Sound Wave - Blitzcrank
  aug(202, 99, 44, 21, 6.2, 6.4, 12.6, 27000), // Sound Wave - Lux
  aug(202, 17, 38, 18, 6.2, 6.4, 12.6, 27000), // Sound Wave - Teemo
  aug(203, 157, 44, 21, 7.4, 6.8, 9.7, 30500), // Warmup Routine - Yasuo
  aug(203, 45, 40, 19, 7.4, 6.8, 9.7, 30500), // Warmup Routine - Veigar
  aug(203, 222, 34, 15, 7.4, 6.8, 9.7, 30500), // Warmup Routine - Jinx
  aug(204, 53, 5, 2, 6.8, 7.0, 9.2, 26000), // Blunt Force - Blitzcrank (low sample)
  aug(204, 17, 4, 1, 6.8, 7.0, 9.2, 26000), // Blunt Force - Teemo
];

const icon = (n: string) => `/lol-game-data/assets/ASSETS/UX/CherryAugments/Icons/${n}_small.png`;

const augmentData = {
  901: {
    name: "Goliath",
    desc: "Become larger, gaining max health, armor and magic resist.",
    rarity: "kPrismatic",
    iconPath: icon("Goliath"),
  },
  902: {
    name: "Eureka",
    desc: "Gain ability haste equal to 15% of your ability power.",
    rarity: "kPrismatic",
    iconPath: icon("Eureka"),
  },
  903: {
    name: "Ethereal Weapon",
    desc: "Your attacks deal bonus true damage on-hit.",
    rarity: "kPrismatic",
    iconPath: icon("EtherealWeapon"),
  },
  904: {
    name: "Jeweled Gauntlet",
    desc: "Your abilities can critically strike.",
    rarity: "kPrismatic",
    iconPath: icon("JeweledGauntlet"),
  },
  501: {
    name: "Infernal Conduit",
    desc: "Damaging abilities burn enemies for magic damage over time.",
    rarity: "kGold",
    iconPath: icon("InfernalConduit"),
  },
  502: {
    name: "Frost Wraith",
    desc: "Periodically fire a frost bolt at a nearby enemy, slowing them.",
    rarity: "kGold",
    iconPath: icon("FrostWraith"),
  },
  503: {
    name: "Executioner",
    desc: "Deal increased damage to enemies below 40% health.",
    rarity: "kGold",
    iconPath: icon("Executioner"),
  },
  504: {
    name: "Spin to Win",
    desc: "Periodically spin, dealing physical damage to nearby enemies.",
    rarity: "kGold",
    iconPath: icon("SpinToWin"),
  },
  505: {
    name: "Lightning Strikes",
    desc: "Your attacks build charges that unleash chain lightning.",
    rarity: "kGold",
    iconPath: icon("LightningStrikes"),
  },
  506: {
    name: "Dawnbringer's Resolve",
    desc: "Heal over time when dropping below 50% health.",
    rarity: "kGold",
    iconPath: icon("DawnbringersResolve"),
  },
  507: {
    name: "Keystone Conjurer",
    desc: "Gain Summon Aery and your keystones recharge faster.",
    rarity: "kGold",
    iconPath: icon("KeystoneConjurer"),
  },
  201: {
    name: "Scoped Weapons",
    desc: "Gain attack range and deal bonus damage to distant enemies.",
    rarity: "kSilver",
    iconPath: icon("ScopedWeapons"),
  },
  202: {
    name: "Sound Wave",
    desc: "Periodically emit a sound wave, damaging enemies it passes through.",
    rarity: "kSilver",
    iconPath: icon("SoundWave"),
  },
  203: {
    name: "Warmup Routine",
    desc: "Gain stacking attack speed the longer combat lasts.",
    rarity: "kSilver",
    iconPath: icon("WarmupRoutine"),
  },
  204: {
    name: "Blunt Force",
    desc: "Gain attack damage. Your attacks briefly slow.",
    rarity: "kSilver",
    iconPath: icon("BluntForce"),
  },
};

const championData = {
  101: { name: "Malzahar" },
  222: { name: "Jinx" },
  22: { name: "Ashe" },
  99: { name: "Lux" },
  115: { name: "Ziggs" },
  21: { name: "Miss Fortune" },
  53: { name: "Blitzcrank" },
  45: { name: "Veigar" },
  157: { name: "Yasuo" },
  17: { name: "Teemo" },
};

// ~2060 recorded picks against 2400 augment slots keeps pick rates in the
// realistic 0.5-10% band
const totalSlots = 2400;

// MayhemStats components live on the site's dark canvas - previews carry it.
// The table is min-w-[960px]; the capture viewport is 900x700, so a mild
// zoom keeps every column (through KDA / DMG) and all 15 rows in frame
// without touching the component.
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  zoom: 0.85,
};

// The full augment tier list, default-sorted by score; tiers rank within
// each rarity so all three colors interleave
export function FullTable() {
  return (
    <div style={canvas}>
      <AugmentsTable
        rows={rows}
        filters={{}}
        totalSlots={totalSlots}
        augmentData={augmentData}
        championData={championData}
        onSelectChampion={() => {}}
      />
    </div>
  );
}

// The 20+ picks toggle drops low-sample augments (Ethereal Weapon, Blunt
// Force) without reranking or reflowing the columns
export function ConfidentOnly() {
  return (
    <div style={canvas}>
      <AugmentsTable
        rows={rows}
        filters={{}}
        totalSlots={totalSlots}
        augmentData={augmentData}
        championData={championData}
        onSelectChampion={() => {}}
      />
    </div>
  );
}
