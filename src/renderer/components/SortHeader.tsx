import { useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

// Column sorting for a data table. Mirrors the website's components/SortHeader
// so a table behaves the same in both places: clicking a new column sorts it
// by its natural direction — descending for numbers, ascending for names —
// and clicking the active column reverses it.
export function useSort<K extends string>(initialKey: K, initialDir: SortDir = "desc") {
  const [sort, setSort] = useState<SortState<K>>({ key: initialKey, dir: initialDir });
  const toggle = (key: K, naturalDir: SortDir = "desc") =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: naturalDir },
    );
  return { sort, toggle };
}

const TH_BASE =
  "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] select-none";

export default function SortHeader<K extends string>({
  label,
  field,
  sort,
  onSort,
  naturalDir = "desc",
  className,
  title,
  thClass = TH_BASE,
}: {
  label: string;
  field: K;
  sort: SortState<K>;
  onSort: (key: K, naturalDir?: SortDir) => void;
  // Which way this column sorts on first click. Names read best A→Z; every
  // number here reads best biggest-first.
  naturalDir?: SortDir;
  className?: string;
  title?: string;
  // Tables with their own header metrics pass their own base classes
  thClass?: string;
}) {
  const active = sort.key === field;
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${thClass} ${active ? "text-lol-gold" : "text-lol-text"} ${className ?? ""}`}
      title={title}
    >
      {/* A button rather than a click handler on the th: sorting a table has
          to be reachable by keyboard, and this is the element that says so */}
      <button
        type="button"
        onClick={() => onSort(field, naturalDir)}
        className={`flex items-center gap-1 w-full text-left uppercase tracking-[0.08em] cursor-pointer whitespace-nowrap ${
          active ? "text-lol-gold" : "hover:text-lol-gold"
        }`}
      >
        {label}
        <span aria-hidden="true" className={active ? "" : "opacity-0"}>
          {active && sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
