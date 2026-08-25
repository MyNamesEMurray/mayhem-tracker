import { ChampionsTable } from "mayhem-tracker";

// Realistic community aggregates: tier spread, mixed sample sizes, pentas.
// Champion icons load from Data Dragon at runtime.
const row = (
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
  queue_id: 3300,
  champion_id,
  games,
  wins,
  kills: k * games,
  deaths: d * games,
  assists: a * games,
  damage: damage * games,
  damage_taken: 28000 * games,
  heal: 9000 * games,
  gold: 14200 * games,
  pentas,
});

const rows = [
  row(101, 48, 33, 7.2, 5.1, 14.8, 41200, 2), // Malzahar
  row(222, 52, 34, 11.4, 6.0, 9.1, 38900, 3), // Jinx
  row(22, 45, 27, 8.8, 6.2, 13.5, 33100), // Ashe
  row(99, 41, 24, 9.6, 5.8, 12.2, 36700, 1), // Lux
  row(115, 38, 21, 8.1, 6.5, 10.9, 35400), // Ziggs
  row(21, 36, 19, 9.9, 6.8, 8.7, 34800, 1), // Miss Fortune
  row(53, 33, 16, 2.4, 6.9, 18.3, 12900), // Blitzcrank
  row(45, 29, 13, 10.2, 7.4, 9.8, 39600), // Veigar
  row(157, 24, 10, 8.4, 8.0, 7.2, 31000), // Yasuo
  row(17, 9, 6, 6.1, 5.5, 8.9, 28800), // Teemo (low sample)
];

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

const totalSlots = rows.reduce((s, r) => s + r.games, 0);

// MayhemStats components live on the site's dark canvas — previews carry it
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
};

// The main tier list: rank, tier, score, win rate, KDA, damage, pentas
export function TierList() {
  return (
    <div style={canvas}>
      <ChampionsTable
        rows={rows}
        filters={{}}
        totalSlots={totalSlots}
        championData={championData}
        onSelectChampion={() => {}}
      />
    </div>
  );
}

// The 20+ games toggle hides low-sample champions without reranking the rest
export function ConfidentOnly() {
  return (
    <div style={canvas}>
      <ChampionsTable
        rows={rows}
        filters={{}}
        totalSlots={totalSlots}
        championData={championData}
        onSelectChampion={() => {}}
      />
    </div>
  );
}
