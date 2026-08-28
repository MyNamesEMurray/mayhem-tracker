import { MultikillBadge } from "mayhem-tracker";

// Match-row dark canvas
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

// All four tiers at count 1 - sky double, amber triple, purple quadra, red penta
export function AllTiers() {
  return (
    <div style={canvas}>
      <MultikillBadge doubles={1} triples={1} quadras={1} pentas={1} />
    </div>
  );
}

// Counts above 1 get an xN suffix - a monster Katarina game
export function WithCounts() {
  return (
    <div style={canvas}>
      <MultikillBadge doubles={4} triples={2} quadras={1} pentas={2} />
    </div>
  );
}

// The common case: a couple of doubles and nothing else - lower tiers
// simply don't render when their count is zero
export function TypicalGame() {
  return (
    <div style={canvas}>
      <MultikillBadge doubles={2} triples={0} quadras={0} pentas={0} />
    </div>
  );
}
