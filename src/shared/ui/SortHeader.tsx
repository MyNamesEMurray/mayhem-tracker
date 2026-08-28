import { useSort, type SortDir, type SortState } from "./sortState";

// The sortable column header itself. The state it drives lives in
// sortState.ts, and is re-exported here so the call sites that have always
// imported both from this file keep working.
export { useSort };
export type { SortDir, SortState };

const TH_BASE =
  "px-3 py-[9px] text-left text-[11px] font-medium uppercase tracking-[.08em] select-none";

export default function SortHeader<K extends string>({
  label,
  field,
  sort,
  onSort,
  naturalDir = "desc",
  className,
  title,
  thClass = TH_BASE,
  compact = false,
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
  // Tables with their own header metrics (the champion page's narrow panels)
  // pass their own base classes
  thClass?: string;
  // For columns too narrow to hold a reserved arrow slot. The champion page's
  // panels give Score 44px on a phone, and holding space for an arrow there
  // pushed the neighbouring headers out of their cells.
  compact?: boolean;
}) {
  const active = sort.key === field;
  return (
    <th
      // Screen readers announce the sort state from the header itself
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${thClass} ${active ? "text-lol-gold" : "text-lol-text"} ${className ?? ""}`}
      title={title}
    >
      {/* A button rather than a click handler on the th: sorting a table has
          to be reachable by keyboard, and this is the element that says so */}
      <button
        type="button"
        onClick={() => onSort(field, naturalDir)}
        className={`flex items-center gap-1 w-full text-left uppercase tracking-[.08em] cursor-pointer ${
          compact ? "min-w-0 overflow-hidden" : "whitespace-nowrap"
        } ${active ? "text-lol-gold" : "hover:text-lol-gold"}`}
      >
        <span className={compact ? "truncate" : ""}>{label}</span>
        {/* Wide columns hold the arrow's space whether or not it shows, so a
            header doesn't jump sideways as you click along the row. Narrow
            ones can't afford it and only draw the arrow when it means
            something. */}
        {compact ? (
          active && (
            <span aria-hidden="true" className="text-[9px] shrink-0">
              {sort.dir === "asc" ? "▲" : "▼"}
            </span>
          )
        ) : (
          <span aria-hidden="true" className={active ? "" : "opacity-0"}>
            {active && sort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    </th>
  );
}
