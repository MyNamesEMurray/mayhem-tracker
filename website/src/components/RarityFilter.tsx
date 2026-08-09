export type Rarity = "all" | "kSilver" | "kGold" | "kPrismatic";

const filters: { key: Rarity; label: string; color: string; activeColor: string }[] = [
  {
    key: "all",
    label: "All",
    color: "text-lol-text",
    activeColor: "bg-lol-gold/20 text-lol-gold border-lol-gold/50",
  },
  {
    key: "kSilver",
    label: "Silver",
    color: "text-gray-300",
    activeColor: "bg-gray-400/20 text-gray-200 border-gray-400/50",
  },
  {
    key: "kGold",
    label: "Gold",
    color: "text-yellow-400",
    activeColor: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50",
  },
  {
    key: "kPrismatic",
    label: "Prismatic",
    color: "text-fuchsia-400",
    activeColor: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/50",
  },
];

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
            value === f.key
              ? f.activeColor
              : `${f.color} border-lol-border hover:border-lol-border/80 bg-lol-card`
          }`}
        >
          {f.label}
        </button>
      ))}
    </>
  );
}
