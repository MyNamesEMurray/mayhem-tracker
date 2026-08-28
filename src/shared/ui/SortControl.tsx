import type { SortDir, SortOption, SortState } from "./sortState";

export type { SortOption };

// Sorting for the card layout. Below 700px a stat board drops its header row
// and becomes stacked cards, which leaves no way to sort at all, since every
// sort control lives in a <th>. This is the same sort state driven from a
// control that survives the card layout.
export default function SortControl<K extends string>({
  options,
  sort,
  onSort,
}: {
  options: SortOption<K>[];
  sort: SortState<K>;
  onSort: (key: K, naturalDir?: SortDir) => void;
}) {
  const active = options.find((o) => o.key === sort.key);
  return (
    <div className="sort-mobile items-center gap-2 w-full">
      <span className="text-xs text-lol-text shrink-0">Sort</span>
      <select
        className="select select-sm select-flex"
        value={sort.key}
        aria-label="Sort by"
        onChange={(e) => {
          const next = options.find((o) => o.key === e.target.value);
          if (next) onSort(next.key, next.naturalDir ?? "desc");
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        // Re-selecting the active column is what reverses it, same as
        // clicking its header on a wide screen
        onClick={() => onSort(sort.key)}
        aria-label={sort.dir === "desc" ? "Sort ascending" : "Sort descending"}
        title={
          sort.dir === "desc"
            ? `${active?.label ?? ""}, highest first - tap for lowest first`
            : `${active?.label ?? ""}, lowest first - tap for highest first`
        }
        className="shrink-0 px-2.5 py-1.5 rounded-lg border border-lol-border bg-lol-card text-lol-text hover:border-lol-gold/40 hover:text-lol-gold text-xs leading-none"
      >
        {sort.dir === "desc" ? "▼" : "▲"}
      </button>
    </div>
  );
}
