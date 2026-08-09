import { RarityFilter } from "mayhem-tracker";

// RarityFilter renders a fragment of pill buttons — the canvas supplies the row
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  display: "flex",
  gap: 8,
  alignItems: "center",
  width: "fit-content",
};

// Default view: "All" active in the brand gold treatment
export function AllSelected() {
  return (
    <div style={canvas}>
      <RarityFilter value="all" onChange={() => {}} />
    </div>
  );
}

// Silver selected — muted gray active pill
export function SilverSelected() {
  return (
    <div style={canvas}>
      <RarityFilter value="kSilver" onChange={() => {}} />
    </div>
  );
}

// Gold selected — yellow active pill
export function GoldSelected() {
  return (
    <div style={canvas}>
      <RarityFilter value="kGold" onChange={() => {}} />
    </div>
  );
}

// Prismatic selected — fuchsia active pill
export function PrismaticSelected() {
  return (
    <div style={canvas}>
      <RarityFilter value="kPrismatic" onChange={() => {}} />
    </div>
  );
}
