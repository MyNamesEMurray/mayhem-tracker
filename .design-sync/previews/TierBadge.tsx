import { TierBadge } from "mayhem-tracker";

// MayhemStats components live on the site's dark canvas - previews carry it
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  display: "flex",
  gap: 12,
  alignItems: "center",
  width: "fit-content",
};

// The full tier ladder as it appears in the tier-list tables
export function AllTiers() {
  const tiers = ["S+", "S", "A", "B", "C", "D"] as const;
  return (
    <div style={canvas}>
      {tiers.map((t) => (
        <TierBadge key={t} tier={t} games={40} />
      ))}
    </div>
  );
}

// Below 10 games the badge dims - the tier is provisional
export function LowSample() {
  return (
    <div style={canvas}>
      <TierBadge tier="A" games={40} />
      <TierBadge tier="A" games={6} />
    </div>
  );
}
