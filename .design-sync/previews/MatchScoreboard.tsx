import { MatchScoreboard } from "mayhem-tracker";

// The renderer's AugmentIcon/ItemIcon load metadata over the Electron bridge
// (window.api). The preview sandbox has no bridge, so shim just enough of it -
// otherwise the effects throw and unmount the whole scoreboard.
const AUGMENTS: Record<number, any> = {
  12: {
    name: "Sonic Boom",
    desc: "",
    rarity: "kSilver",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/SonicBoom_small.png",
  },
  18: {
    name: "Frost Wraith",
    desc: "",
    rarity: "kSilver",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/FrostWraith_small.png",
  },
  27: {
    name: "Lightning Strikes",
    desc: "",
    rarity: "kGold",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/LightningStrikes_small.png",
  },
  33: {
    name: "Executioner",
    desc: "",
    rarity: "kGold",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/Executioner_small.png",
  },
  44: {
    name: "Vampirism",
    desc: "",
    rarity: "kSilver",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/Vampirism_small.png",
  },
  54: {
    name: "Ultimate Revolution",
    desc: "",
    rarity: "kPrismatic",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/UltimateRevolution_small.png",
  },
  61: {
    name: "Dawnbringer's Resolve",
    desc: "",
    rarity: "kPrismatic",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/DawnbringersResolve_small.png",
  },
  72: {
    name: "Deft",
    desc: "",
    rarity: "kGold",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/Deft_small.png",
  },
  81: {
    name: "Courage of the Colossus",
    desc: "",
    rarity: "kGold",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/CourageColossus_small.png",
  },
  95: {
    name: "Mirror Image",
    desc: "",
    rarity: "kPrismatic",
    iconPath: "/lol-game-data/assets/ASSETS/Augments/Icons/MirrorImage_small.png",
  },
};

const w = window as any;
if (!w.api) w.api = {};
w.api.getAugmentData = w.api.getAugmentData ?? (async () => AUGMENTS);
w.api.getItemData = w.api.getItemData ?? (async () => ({}));
w.api.getChampionData = w.api.getChampionData ?? (async () => champData);

// Data Dragon class tags drive the per-class score weights
const champData: Record<number, { name: string; key: string; class?: string }> = {
  222: { name: "Jinx", key: "Jinx", class: "Marksman" },
  54: { name: "Malphite", key: "Malphite", class: "Tank" },
  16: { name: "Soraka", key: "Soraka", class: "Support" },
  55: { name: "Katarina", key: "Katarina", class: "Assassin" },
  266: { name: "Aatrox", key: "Aatrox", class: "Fighter" },
  45: { name: "Veigar", key: "Veigar", class: "Mage" },
  22: { name: "Ashe", key: "Ashe", class: "Marksman" },
  89: { name: "Leona", key: "Leona", class: "Tank" },
  157: { name: "Yasuo", key: "Yasuo", class: "Fighter" },
  117: { name: "Lulu", key: "Lulu", class: "Support" },
};

// One participant in stored LCU shape (nested stats + participantIdentities)
function player(
  participantId: number,
  teamId: number,
  championId: number,
  puuid: string,
  gameName: string,
  win: boolean,
  kda: [number, number, number],
  multi: [number, number, number, number],
  dmg: number,
  taken: number,
  gold: number,
  heal: number,
  items: number[],
  augs: number[],
) {
  return {
    participant: {
      participantId,
      teamId,
      championId,
      puuid,
      stats: {
        kills: kda[0],
        deaths: kda[1],
        assists: kda[2],
        doubleKills: multi[0],
        tripleKills: multi[1],
        quadraKills: multi[2],
        pentaKills: multi[3],
        totalDamageDealtToChampions: dmg,
        totalDamageTaken: taken,
        goldEarned: gold,
        totalHeal: heal,
        largestKillingSpree: Math.max(kda[0] - 2, 0),
        item0: items[0] ?? 0,
        item1: items[1] ?? 0,
        item2: items[2] ?? 0,
        item3: items[3] ?? 0,
        item4: items[4] ?? 0,
        item5: items[5] ?? 0,
        item6: items[6] ?? 0,
        playerAugment1: augs[0] ?? 0,
        playerAugment2: augs[1] ?? 0,
        playerAugment3: augs[2] ?? 0,
        playerAugment4: augs[3] ?? 0,
        win,
      },
    },
    identity: { participantId, player: { gameName, puuid } },
  };
}

// A 25-minute ARAM Mayhem bloodbath: blue side wins 60-44, Katarina pentas,
// Veigar out-damages everyone in the loss (ACE material).
const roster = [
  // Team 1 - Victory
  player(
    1,
    100,
    222,
    "puuid-self",
    "BratCannon",
    true,
    [18, 7, 21],
    [3, 1, 0, 0],
    68400,
    31200,
    18900,
    12400,
    [3006, 3031, 3094, 3036, 3072, 3026, 2052],
    [33, 27, 44, 54],
  ),
  player(
    2,
    100,
    54,
    "puuid-malph",
    "Rock Solid Mike",
    true,
    [6, 9, 28],
    [1, 0, 0, 0],
    24800,
    71300,
    13100,
    8900,
    [3047, 3068, 3075, 3110, 3065, 3143, 2052],
    [81, 18, 12, 61],
  ),
  player(
    3,
    100,
    16,
    "puuid-soraka",
    "HealbotPrime",
    true,
    [3, 6, 34],
    [0, 0, 0, 0],
    14200,
    26900,
    11800,
    54200,
    [3158, 6617, 3222, 3107, 3504, 0, 2052],
    [44, 12, 72, 95],
  ),
  player(
    4,
    100,
    55,
    "puuid-kata",
    "DaggerDelivery",
    true,
    [22, 11, 14],
    [5, 2, 1, 1],
    59800,
    38700,
    17600,
    9600,
    [3020, 3089, 3157, 4645, 3135, 3102, 2052],
    [33, 27, 54, 95],
  ),
  player(
    5,
    100,
    266,
    "puuid-aatrox",
    "World Ender Wes",
    true,
    [11, 8, 19],
    [2, 0, 0, 0],
    42100,
    55600,
    14900,
    31800,
    [3111, 6333, 3071, 3053, 3156, 0, 2052],
    [44, 81, 18, 61],
  ),
  // Team 2 - Defeat
  player(
    6,
    200,
    45,
    "puuid-veigar",
    "InfiniteScaling",
    false,
    [16, 9, 12],
    [2, 1, 0, 0],
    71900,
    29800,
    16700,
    7200,
    [3020, 3089, 6653, 3157, 3135, 4629, 2052],
    [27, 33, 54, 12],
  ),
  player(
    7,
    200,
    22,
    "puuid-ashe",
    "ArrowTaxi",
    false,
    [9, 10, 18],
    [1, 0, 0, 0],
    48600,
    27400,
    14100,
    8100,
    [3006, 3085, 3031, 3094, 3036, 0, 2052],
    [72, 27, 44, 61],
  ),
  player(
    8,
    200,
    89,
    "puuid-leona",
    "SunlightZeal",
    false,
    [4, 12, 22],
    [0, 0, 0, 0],
    18900,
    64100,
    11400,
    10800,
    [3047, 3190, 3075, 3109, 3065, 0, 2052],
    [81, 18, 12, 95],
  ),
  player(
    9,
    200,
    157,
    "puuid-yasuo",
    "0DeathsOnly",
    false,
    [13, 12, 8],
    [2, 0, 0, 0],
    44700,
    41500,
    15300,
    13900,
    [3006, 3031, 3153, 6673, 3156, 3026, 2052],
    [33, 44, 72, 54],
  ),
  player(
    10,
    200,
    117,
    "puuid-lulu",
    "PixPocket",
    false,
    [2, 9, 25],
    [0, 0, 0, 0],
    12800,
    24600,
    10600,
    38700,
    [3158, 6617, 3504, 6616, 3107, 3222, 2052],
    [12, 18, 72, 61],
  ),
];

const raw = {
  gameId: 7301254890,
  queueId: 2400,
  gameMode: "ARAM",
  gameDuration: 1523,
  participants: roster.map((r) => r.participant),
  participantIdentities: roster.map((r) => r.identity),
};

const detail = {
  game: {
    game_id: 7301254890,
    queue_id: 2400,
    game_mode: "ARAM",
    game_creation: 1754650000000,
    game_duration: 1523,
    game_version: "15.16.702.1234",
  },
  stats: {} as any,
  augments: [],
  raw,
};

const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

// The full post-game scoreboard: both teams, OP-style scores with MVP/ACE
// badges, KDA, damage bars normalized to the lobby best, gold, heal, items,
// augments. The viewer's row (BratCannon) is gold-highlighted via puuids.
// NOTE: champion/item/augment art comes from CDN - offline captures show
// placeholder boxes; layout and numbers are what's under review.
// Two sandbox-only shims (no effect on the real app):
// - failed CDN imgs get display:none from their onError handlers, and a
//   display:none grid item generates no box, shifting every row cell one
//   track left - the !important override keeps broken imgs in their tracks
//   so the capture shows the production layout;
// - the capture viewport is 900px and the grid's natural width is ~1020px,
//   so the wrapper zooms to fit.
export function FullMatch() {
  return (
    <div style={canvas} className="msb-preview">
      <style>{`.msb-preview img { display: inline-block !important; font-size: 0 !important; line-height: 0 !important; }`}</style>
      <div style={{ width: 980, zoom: 0.82 }}>
        <MatchScoreboard detail={detail} champData={champData} puuids={["puuid-self"]} />
      </div>
    </div>
  );
}

// Games synced before raw JSON was stored have no participant data
export function DataUnavailable() {
  return (
    <div style={canvas}>
      <div style={{ width: 420 }}>
        <MatchScoreboard
          detail={{ ...detail, raw: null }}
          champData={champData}
          puuids={["puuid-self"]}
        />
      </div>
    </div>
  );
}
