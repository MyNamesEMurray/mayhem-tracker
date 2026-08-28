import { useState } from "react";

// Table sorting's state and vocabulary, shared by the desktop app and
// mayhemstats.com. In a .ts file of its own rather than inside SortHeader so
// that boardSort.ts, which draws nothing, can import the types without
// pulling a component - and a JSX one - in behind them.

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

// An option in the card layout's sort dropdown
export interface SortOption<K extends string> {
  key: K;
  label: string;
  naturalDir?: SortDir;
}

// Clicking a new column sorts it by its natural direction - descending for
// numbers, ascending for names - and clicking the active column reverses it.
export function useSort<K extends string>(initialKey: K, initialDir: SortDir = "desc") {
  const [sort, setSort] = useState<SortState<K>>({ key: initialKey, dir: initialDir });
  const toggle = (key: K, naturalDir: SortDir = "desc") =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: naturalDir },
    );
  return { sort, toggle };
}
