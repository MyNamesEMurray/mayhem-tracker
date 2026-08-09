import { StatCard } from "mayhem-tracker";

// Dashboard-style dark canvas — StatCard sits on the app's dark background
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
      <StatCard label="Games Played" value={342} subtext="since June 2025" />
      <StatCard label="Win Rate" value="54.2%" subtext="185W — 157L" />
      <StatCard label="Avg KDA" value="3.42" subtext="9.8 / 6.4 / 12.1" />
      <StatCard label="Pentakills" value={7} subtext="2 on Katarina" />
    </div>
  );
}

// Without subtext the card stays compact — used in tight side panels
export function Minimal() {
  return (
    <div style={{ ...canvas, display: "flex", gap: 12 }}>
      <StatCard label="Longest Spree" value={14} />
      <StatCard label="Best Score" value="9.8" />
    </div>
  );
}
