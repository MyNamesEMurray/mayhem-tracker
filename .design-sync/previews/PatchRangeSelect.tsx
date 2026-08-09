import { PatchRangeSelect } from "mayhem-tracker";

// Newest first — patches[0] is the current patch
const patches = ["16.15", "16.14", "16.13", "16.12", "16.11"];

const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

// Default view — no ?patch= param means current patch only
export function CurrentPatch() {
  return (
    <div style={canvas}>
      <PatchRangeSelect patches={patches} param={null} onChange={() => {}} />
    </div>
  );
}

// param="all" — every patch, single select
export function AllPatches() {
  return (
    <div style={canvas}>
      <PatchRangeSelect patches={patches} param="all" onChange={() => {}} />
    </div>
  );
}

// Range mode — from/to selects appear next to the mode dropdown
export function RangeSelection() {
  return (
    <div style={canvas}>
      <PatchRangeSelect patches={patches} param="16.13-16.15" onChange={() => {}} />
    </div>
  );
}
