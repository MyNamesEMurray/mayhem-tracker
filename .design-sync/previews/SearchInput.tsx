import { SearchInput } from "mayhem-tracker";

// MayhemStats components live on the site's dark canvas — previews carry it
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

// Empty state — the placeholder tells you what the box filters
export function EmptyWithPlaceholder() {
  return (
    <div style={canvas}>
      <SearchInput value="" onChange={() => {}} placeholder="Search champions…" />
    </div>
  );
}

// With text entered, the clear (x) button appears on the right edge
export function FilledWithClear() {
  return (
    <div style={canvas}>
      <SearchInput value="Malzahar" onChange={() => {}} placeholder="Search champions…" />
    </div>
  );
}

// Augments-page variant — same control, different placeholder copy
export function AugmentSearch() {
  return (
    <div style={canvas}>
      <SearchInput value="" onChange={() => {}} placeholder="Search augments…" />
    </div>
  );
}
