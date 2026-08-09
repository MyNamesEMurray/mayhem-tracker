export type Rarity = "all" | "kSilver" | "kGold" | "kPrismatic";

// Unified chips: inactive chips carry the rarity color as text on the plain
// border, hovering tints the border toward the rarity; active fills with the
// rarity's translucent bg.
const filters: { key: Rarity; label: string; color: string; hover: string; active: string }[] = [
  {
    key: "all",
    label: "All",
    color: "text-lol-text",
    hover: "hover:border-lol-gold/50",
    active: "bg-lol-gold/15 text-lol-gold border-lol-gold/50",
  },
  {
    key: "kSilver",
    label: "Silver",
    color: "text-gray-300",
    hover: "hover:border-gray-400/50",
    active: "bg-gray-400/15 text-gray-200 border-gray-400/50",
  },
  {
    key: "kGold",
    label: "Gold",
    color: "text-yellow-400",
    hover: "hover:border-yellow-500/50",
    active: "bg-yellow-500/15 text-yellow-300 border-yellow-500/50",
  },
  {
    key: "kPrismatic",
    label: "Prismatic",
    color: "text-fuchsia-400",
    hover: "hover:border-fuchsia-400/50",
    active: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/50",
  },
];

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
      {filters.map((f) => (
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
