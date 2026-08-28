import { WinRateBar } from "mayhem-tracker";

// MayhemStats components live on the site's dark canvas - previews carry it
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: 260,
};

// Color encodes the bracket: green ≥60%, blue ≥50%, red below
export function Rates() {
  return (
    <div style={{ ...canvas, display: "grid", gap: 10 }}>
      <WinRateBar wins={41} total={60} />
      <WinRateBar wins={33} total={60} />
      <WinRateBar wins={24} total={60} />
    </div>
  );
}

// Under 20 games the percentage renders muted with an asterisk
export function LowSample() {
  return (
    <div style={canvas}>
      <WinRateBar wins={3} total={4} />
    </div>
  );
}
