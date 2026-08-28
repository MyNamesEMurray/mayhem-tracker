import { StatTile } from "mayhem-tracker";

// Dashboard-style dark canvas - StatTile sits on the app's dark background
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

// The dashboard header row: four summary cards side by side
export function DashboardRow() {
  return (
    <div style={{ ...canvas, display: "flex", gap: 12 }}>
      <StatTile label="Games Played" value={342} sub="since June 2025" />
      <StatTile label="Win Rate" value="54.2%" sub="185W - 157L" />
      <StatTile label="Avg KDA" value="3.42" sub="9.8 / 6.4 / 12.1" />
      <StatTile label="Pentakills" value={7} sub="2 on Katarina" />
    </div>
  );
}

// Without subtext the card stays compact - used in tight side panels
export function Minimal() {
  return (
    <div style={{ ...canvas, display: "flex", gap: 12 }}>
      <StatTile label="Longest Spree" value={14} />
      <StatTile label="Best Score" value="9.8" />
    </div>
  );
}
