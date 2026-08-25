import { LABEL, Panel } from "mayhem-tracker";

const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 24,
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  width: 420,
};

// The card surface everything sits on. Padding is the caller's, because a
// stat block, a section and a table each want a different amount of it.
export function Paddings() {
  return (
    <div style={canvas}>
      <Panel className="p-4">
        <p className={`${LABEL} mb-1`}>Compact — p-4</p>
        <p className="text-sm text-lol-text-bright">A stat block or a single figure.</p>
      </Panel>
      <Panel className="p-5">
        <p className={`${LABEL} mb-1`}>Section — p-5</p>
        <p className="text-sm text-lol-text-bright">A titled group of controls or rows.</p>
      </Panel>
      <Panel className="p-8 text-center text-sm">No games match these filters.</Panel>
    </div>
  );
}
