import { ChampionDetail } from "mayhem-tracker";

// Malzahar's detail page. A 12-champion cohort backs the header tier badge
// (tiers are relative, so the cohort must exist). Item names resolve via
// loadItemData() at runtime — in sandboxes without network they fall back to
// "Item <id>"; the ids below are the real mage core (Liandry's, Rabadon's,
// Zhonya's...).

const champRow = (
  champion_id: number,
  games: number,
  wins: number,
  k: number,
  d: number,
  a: number,
  damage: number,
  pentas = 0,
) => ({
  patch: "16.15",
  queue_id: 2400,
  champion_id,
  games,
  wins,
  kills: Math.round(k * games),
  deaths: Math.round(d * games),
  assists: Math.round(a * games),
  damage: Math.round(damage * games),
  damage_taken: 27500 * games,
  heal: 8800 * games,
  gold: 14100 * games,
  pentas,
});

const championRows = [
  champRow(101, 52, 31, 7.4, 5.2, 15.1, 41800, 2), // Malzahar — the subject
  champRow(222, 55, 30, 11.2, 6.1, 9.0, 38600, 3), // Jinx
  champRow(22, 48, 26, 8.6, 6.2, 13.4, 33200), // Ashe
  champRow(99, 45, 24, 9.5, 5.9, 12.1, 36500, 1), // Lux
  champRow(115, 42, 22, 8.2, 6.4, 10.8, 35100), // Ziggs
  champRow(21, 40, 20, 9.8, 6.7, 8.8, 34600, 1), // Miss Fortune
  champRow(53, 38, 18, 2.5, 6.8, 18.1, 13100), // Blitzcrank
  champRow(50, 33, 15, 6.8, 6.0, 13.9, 32800), // Swain
  champRow(45, 35, 16, 10.1, 7.3, 9.7, 39200), // Veigar
  champRow(157, 30, 13, 8.5, 7.9, 7.3, 31200), // Yasuo
  champRow(161, 26, 12, 9.2, 6.6, 11.4, 40100), // Vel'Koz
  champRow(17, 28, 11, 6.0, 5.6, 8.8, 28600), // Teemo
];

// Malzahar's augment picks across all three rarities — 20+ picks on the
// leaders so Best augments looks confident, plus a few low-sample fillers
const augRow = (augment_id: number, picks: number, wins: number, k: number, d: number, a: number, dmg: number) => ({
  patch: "16.15",
  queue_id: 2400,
  augment_id,
  champion_id: 101,
  picks,
  wins,
  kills: Math.round(k * picks),
  deaths: Math.round(d * picks),
  assists: Math.round(a * picks),
  damage: Math.round(dmg * picks),
});

const augmentRows = [
  // Prismatic
  augRow(901, 34, 22, 6.8, 5.0, 15.8, 40200), // Goliath
  augRow(902, 27, 16, 8.1, 5.3, 14.6, 44800), // Eureka
  augRow(903, 8, 5, 8.8, 4.9, 13.2, 46100), // Ethereal Weapon (low sample)
  augRow(904, 3, 1, 7.9, 6.1, 12.8, 43500), // Jeweled Gauntlet (low sample)
  // Gold
  augRow(501, 31, 20, 7.9, 5.1, 15.3, 45400), // Infernal Conduit
  augRow(502, 24, 13, 7.0, 5.4, 15.0, 39700), // Frost Wraith
  augRow(503, 21, 10, 7.6, 5.7, 14.1, 41900), // Executioner
  augRow(504, 6, 2, 6.4, 6.3, 12.5, 36200), // Spin to Win (low sample)
  // Silver
  augRow(201, 29, 17, 7.7, 5.2, 14.9, 42600), // Scoped Weapons
  augRow(202, 23, 12, 7.1, 5.5, 15.2, 38900), // Sound Wave
  augRow(203, 20, 11, 7.3, 5.6, 14.4, 40800), // Warmup Routine
  augRow(204, 4, 2, 6.6, 6.0, 13.0, 35700), // Blunt Force (low sample)
];

// Malzahar's item picks — the real mage core plus two low-sample entries so
// the * suffix and 20+ filter both have something to bite on
const itemRow = (item_id: number, picks: number, wins: number) => ({
  patch: "16.15",
  queue_id: 2400,
  champion_id: 101,
  item_id,
  picks,
  wins,
});

const itemRows = [
  itemRow(3020, 44, 26), // Sorcerer's Shoes
  itemRow(6653, 41, 26), // Liandry's Torment
  itemRow(3089, 36, 23), // Rabadon's Deathcap
  itemRow(3157, 33, 20), // Zhonya's Hourglass
  itemRow(3116, 28, 16), // Rylai's Crystal Scepter
  itemRow(3135, 24, 14), // Void Staff
  itemRow(3040, 11, 7), // Seraph's Embrace (low sample)
  itemRow(4645, 3, 2), // Shadowflame (low sample)
];

const icon = (n: string) => `/lol-game-data/assets/ASSETS/UX/CherryAugments/Icons/${n}_small.png`;

const augmentData = {
  901: { name: "Goliath", desc: "Become larger, gaining max health, armor and magic resist.", rarity: "kPrismatic", iconPath: icon("Goliath") },
  902: { name: "Eureka", desc: "Gain ability haste equal to 15% of your ability power.", rarity: "kPrismatic", iconPath: icon("Eureka") },
  903: { name: "Ethereal Weapon", desc: "Your attacks deal bonus true damage on-hit.", rarity: "kPrismatic", iconPath: icon("EtherealWeapon") },
  904: { name: "Jeweled Gauntlet", desc: "Your abilities can critically strike.", rarity: "kPrismatic", iconPath: icon("JeweledGauntlet") },
  501: { name: "Infernal Conduit", desc: "Damaging abilities burn enemies for magic damage over time.", rarity: "kGold", iconPath: icon("InfernalConduit") },
  502: { name: "Frost Wraith", desc: "Periodically fire a frost bolt at a nearby enemy, slowing them.", rarity: "kGold", iconPath: icon("FrostWraith") },
  503: { name: "Executioner", desc: "Deal increased damage to enemies below 40% health.", rarity: "kGold", iconPath: icon("Executioner") },
  504: { name: "Spin to Win", desc: "Periodically spin, dealing physical damage to nearby enemies.", rarity: "kGold", iconPath: icon("SpinToWin") },
  201: { name: "Scoped Weapons", desc: "Gain attack range and deal bonus damage to distant enemies.", rarity: "kSilver", iconPath: icon("ScopedWeapons") },
  202: { name: "Sound Wave", desc: "Periodically emit a sound wave, damaging enemies it passes through.", rarity: "kSilver", iconPath: icon("SoundWave") },
  203: { name: "Warmup Routine", desc: "Gain stacking attack speed the longer combat lasts.", rarity: "kSilver", iconPath: icon("WarmupRoutine") },
  204: { name: "Blunt Force", desc: "Gain attack damage. Your attacks briefly slow.", rarity: "kSilver", iconPath: icon("BluntForce") },
};

const championData = {
  101: { name: "Malzahar" },
  222: { name: "Jinx" },
  22: { name: "Ashe" },
  99: { name: "Lux" },
  115: { name: "Ziggs" },
  21: { name: "Miss Fortune" },
  53: { name: "Blitzcrank" },
  50: { name: "Swain" },
  45: { name: "Veigar" },
  157: { name: "Yasuo" },
  161: { name: "Vel'Koz" },
  17: { name: "Teemo" },
};

// MayhemStats components live on the site's dark canvas — previews carry it
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
};

// Full detail view: header with tier + KDA line, core build, best augments
// by rarity, and the two full tables
export function MalzaharDetail() {
  return (
    <div style={canvas}>
      <ChampionDetail
        championId={101}
        championRows={championRows}
        augmentRows={augmentRows}
        itemRows={itemRows}
        filters={{}}
        championData={championData}
        augmentData={augmentData}
        onBack={() => {}}
      />
    </div>
  );
}

// The 20+ games toggle narrows the full tables only; Core build and Best
// augments keep their shrinkage-ranked entries
export function ConfidentOnly() {
  return (
    <div style={canvas}>
      <ChampionDetail
        championId={101}
        championRows={championRows}
        augmentRows={augmentRows}
        itemRows={itemRows}
        filters={{}}
        minGames={20}
        championData={championData}
        augmentData={augmentData}
        onBack={() => {}}
      />
    </div>
  );
}
