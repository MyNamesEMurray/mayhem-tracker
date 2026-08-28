import { parsePatchParam, PatchRangeSelect } from "mayhem-tracker";

// Newest first — patches[0] is the current patch. Year-based names, which is
// how patches have been stored since the community database was normalised.
const patches = ["26.2", "26.1", "25.24", "25.23", "25.22"];

const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

// The control holds no state — each surface passes a selection in and gets one
// back — so a preview names the state it wants through the same parser the
// site uses on its ?patch= parameter.
function Preview({ param }: { param: string | null }) {
  return (
    <div style={canvas}>
      <PatchRangeSelect
        patches={patches}
        selection={parsePatchParam(param, patches)}
        onChange={() => {}}
      />
    </div>
  );
}

// The default on both surfaces: the newest patch, one dropdown
export function CurrentPatch() {
  return <Preview param={null} />;
}

// No patch filter at all
export function AllPatches() {
  return <Preview param="all" />;
}

// A span: the mode dropdown shrinks to "Range" and the two ends appear beside it
export function RangeSelection() {
  return <Preview param="25.24-26.2" />;
}

// One patch that isn't the newest — a range whose ends are equal, which is
// also what an old single-patch link parses to
export function SinglePatch() {
  return <Preview param="25.23" />;
}
