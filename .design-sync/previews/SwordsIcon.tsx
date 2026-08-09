import { SwordsIcon } from "mayhem-tracker";

// Icons take plain SVG props: width/height (default 1em), stroke currentColor.
// Shown at 16/24/40 in the site text color, plus 24 in gold, on the dark canvas.
export function Sizes() {
  return (
    <div
      style={{
        background: "var(--color-lol-dark)",
        padding: 20,
        borderRadius: 12,
        display: "flex",
        gap: 16,
        alignItems: "center",
        width: "fit-content",
      }}
    >
      <span style={{ color: "var(--color-lol-text)", display: "flex", gap: 16, alignItems: "center" }}>
        <SwordsIcon width={16} height={16} />
        <SwordsIcon width={24} height={24} />
        <SwordsIcon width={40} height={40} />
      </span>
      <span style={{ color: "var(--color-lol-gold)", display: "flex", alignItems: "center" }}>
        <SwordsIcon width={24} height={24} />
      </span>
    </div>
  );
}
