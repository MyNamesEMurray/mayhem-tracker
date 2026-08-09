export type Rarity = "all" | "kSilver" | "kGold" | "kPrismatic";

// Rarity chips per the unified language: inactive chips carry the rarity
// color as text on a dark chip whose border tints to the rarity on hover;
// active chips get a translucent rarity fill.
const filters: { key: Rarity; label: string; inactive: string; active: string }[] = [
  {
    key: "all",
    label: "All",
    inactive: "bg-lol-dark text-lol-text border-lol-border hover:border-lol-gold/50",
    active: "bg-lol-gold/15 text-lol-gold border-lol-gold/50",
  },
  {
    key: "kSilver",
    label: "Silver",
    inactive: "bg-lol-dark text-gray-300 border-lol-border hover:border-gray-300/50",
    active: "bg-gray-300/15 text-gray-300 border-gray-300/50",
  },
  {
    key: "kGold",
    label: "Gold",
    inactive: "bg-lol-dark text-yellow-400 border-lol-border hover:border-yellow-400/50",
    active: "bg-yellow-400/15 text-yellow-400 border-yellow-400/50",
  },
  {
    key: "kPrismatic",
    label: "Prismatic",
    inactive: "bg-lol-dark text-fuchsia-400 border-lol-border hover:border-fuchsia-400/50",
    active: "bg-fuchsia-400/15 text-fuchsia-400 border-fuchsia-400/50",
  },
];

// Renders just the buttons so callers keep control of the surrounding row
export default function RarityFilter({
  value,
  onChange,
}: {
  value: Rarity;
  onChange: (rarity: Rarity) => void;
}) {
  return (
    <>
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
            value === f.key ? f.active : f.inactive
          }`}
        >
          {f.label}
        </button>
      ))}
    </>
  );
}
