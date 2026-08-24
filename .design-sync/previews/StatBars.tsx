import { StatBars } from "mayhem-tracker";

// Match-row dark canvas
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

const label: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  opacity: 0.65,
  marginBottom: 6,
};

// Bars are normalized against the lobby's best in each category
const gameMax = { dmg: 71900, taken: 71300, heal: 54200 };

// One game, three roles: the carry tops damage, the tank tops damage
// taken, the enchanter tops healing — bars show each share of the best.
export function RoleProfiles() {
  return (
    <div style={{ ...canvas, display: "flex", gap: 28 }}>
      <div style={{ width: 190 }}>
        <div style={label}>Jinx — carry</div>
        <StatBars damage={68400} taken={31200} heal={12400} max={gameMax} />
      </div>
      <div style={{ width: 190 }}>
        <div style={label}>Malphite — tank</div>
        <StatBars damage={24800} taken={71300} heal={8900} max={gameMax} />
      </div>
      <div style={{ width: 190 }}>
        <div style={label}>Soraka — enchanter</div>
        <StatBars damage={14200} taken={26900} heal={54200} max={gameMax} />
      </div>
    </div>
  );
}

// Low numbers and a zero: sub-1k values print raw, zero leaves the track empty
export function EarlySurrender() {
  return (
    <div style={{ ...canvas, display: "flex", gap: 28 }}>
      <div style={{ width: 190 }}>
        <div style={label}>Remake at 6:21</div>
        <StatBars damage={4310} taken={860} heal={0} max={{ dmg: 6200, taken: 5100, heal: 1800 }} />
      </div>
    </div>
  );
}
