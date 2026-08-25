import { RARITY_CHIPS, type Rarity } from "./rarity";

// The rarity chip row, shared by the desktop app and mayhemstats.com.
// Renders just the buttons so callers keep control of the surrounding row.
export type { Rarity };

export default function RarityFilter({
  value,
  onChange,
  compact = false,
}: {
  value: Rarity;
  onChange: (rarity: Rarity) => void;
  compact?: boolean;
}) {
  return (
    <>
      {RARITY_CHIPS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`${
            compact ? "px-2 py-[3px] text-[11px]" : "px-3 py-1 text-xs"
          } font-medium rounded-lg border transition-colors ${
            value === f.key ? f.active : `${f.color} border-lol-border bg-lol-card ${f.hover}`
          }`}
        >
          {f.label}
        </button>
      ))}
    </>
  );
}
