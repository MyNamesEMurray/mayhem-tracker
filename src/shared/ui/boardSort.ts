import type { ReactNode } from "react";
import type { SortDir, SortOption, SortState } from "./sortState";

// The half of the stat board that has nothing to do with drawing: what a
// column is, and how a list of them turns into an order. Kept apart from
// StatBoard.tsx so it can be tested without a renderer.

// Where a column goes once the row is a card rather than a table row. The
// named slots are the card's fixed anatomy; anything else flows underneath as
// a labelled figure. "none" leaves the column out of the card entirely: the
// expander caret, which has nothing to point at once the whole card is the
// tap target, and Gold, whose fifth figure wrapped the grid onto a line of
// its own.
export type CardArea = "rank" | "name" | "tier" | "score" | "bar" | "stat" | "none";

export interface BoardColumn<Row, K extends string> {
  // The sort key, or null for a column with nothing to sort by (the rank
  // number is the row's position in whatever order is showing).
  key: K | null;
  label: string;
  render: (row: Row, index: number) => ReactNode;
  // What the column sorts by. Strings compare with localeCompare, numbers
  // numerically. A column with a key needs one.
  sortValue?: (row: Row) => number | string;
  naturalDir?: SortDir;
  // Tailwind width class for the header cell
  width?: string;
  cellClass?: string;
  headerTitle?: string;
  // Columns held back until the window is wide enough to hold them
  detail?: boolean;
  area?: CardArea;
  // Card figures are labelled from `label` unless this says otherwise
  cardLabel?: string | null;
}

// Infinity is a real KDA - a champion with no deaths in the sample - and it
// has to sort as the largest value rather than falling out of the order,
// which is what a bare subtraction does with it (Infinity - Infinity is NaN,
// and a NaN comparator leaves the array in whatever order it started in).
export function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "string" || typeof b === "string") {
    return String(a).localeCompare(String(b));
  }
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : -1) : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Sorts rows by the column the sort state names. A key with no column, or a
// column with nothing to sort by, leaves the order alone rather than
// scrambling it.
export function sortRows<Row, K extends string>(
  rows: Row[],
  columns: BoardColumn<Row, K>[],
  sort: SortState<K>,
): Row[] {
  const column = columns.find((c) => c.key === sort.key);
  if (!column?.sortValue) return rows;
  const value = column.sortValue;
  const out = [...rows];
  out.sort((a, b) => {
    const cmp = compareValues(value(a), value(b));
    return sort.dir === "desc" ? -cmp : cmp;
  });
  return out;
}

// The sort dropdown's options, which are the sortable columns in the order
// they appear. Kept in step with the header row by construction rather than
// by a second list somebody has to remember to edit - which is how the two
// surfaces' lists came to disagree with their own headers.
export function sortOptions<Row, K extends string>(
  columns: BoardColumn<Row, K>[],
): SortOption<K>[] {
  return columns
    .filter((c): c is BoardColumn<Row, K> & { key: K } => c.key != null && c.sortValue != null)
    .map((c) => ({ key: c.key, label: c.label, naturalDir: c.naturalDir }));
}
