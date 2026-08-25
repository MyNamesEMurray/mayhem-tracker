import { Button } from "mayhem-tracker";

const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 24,
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "fit-content",
};

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10 };

// Gold is the call to action; plain is the quieter one beside it. This
// replaced eight hand-written variants whose border, background, hover,
// radius, text size and padding had all pulled apart.
export function Tones() {
  return (
    <div style={canvas}>
      <div style={row}>
        <Button>Refresh</Button>
        <Button tone="plain">Skip</Button>
      </div>
      <div style={row}>
        <Button disabled>Updating…</Button>
        <Button tone="plain" disabled>
          Skip
        </Button>
      </div>
    </div>
  );
}

// Three sizes, for a dialog's inline action, a page control, and a first-run
// call to action respectively
export function Sizes() {
  return (
    <div style={{ ...canvas, ...row }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}
