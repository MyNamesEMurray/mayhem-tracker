import { useMemo, useState } from "react";
import type { ChampionStatRow } from "../lib/api";
import type { ChampionData } from "../lib/dragon";
import { getChampionName } from "../lib/dragon";
import { aggregateChampions, assignTiers, score, type Filters } from "../lib/stats";
import SearchField from "../../../src/shared/ui/SearchField.tsx";
import { useSort } from "../../../src/shared/ui/SortHeader.tsx";
import StatBoard, {
  SortControl,
  sortOptions,
  sortRows,
} from "../../../src/shared/ui/StatBoard.tsx";
import { championColumns, type ChampionSortKey } from "../../../src/shared/ui/boardColumns.tsx";
import { championSlug } from "../lib/slug";

export default function ChampionsTable({
  rows,
  filters,
  totalSlots,
  championData,
  onSelectChampion,
}: {
  rows: ChampionStatRow[];
  filters: Filters;
  totalSlots: number;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const { sort, toggle } = useSort<ChampionSortKey>("score");

  // Tiers are ranked across ALL champions under the current filter, before
  // search narrows the list - searching "teemo" must not make Teemo S+
  const { list, tiers } = useMemo(() => {
    const aggregated = aggregateChampions(rows, filters);
    const tiers = assignTiers(
      aggregated,
      (c) => score(c.wins, c.games),
      (c) => c.champion_id,
    );
    // The site's aggregate carries totals; the board reads the two big
    // figures per game, which is the shape the app's rows already have.
    const list = aggregated.map((c) => ({
      ...c,
      avg_damage: c.games > 0 ? c.damage / c.games : 0,
      avg_gold: c.games > 0 ? c.gold / c.games : 0,
    }));
    return { list, tiers };
  }, [rows, filters]);

  const columns = useMemo(
    () =>
      championColumns({
        tiers,
        totalSlots,
        name: (id) => getChampionName(championData, id),
        // The site links every champion name, so a row is shareable and a
        // crawler has something to follow. The app has no URLs to link to.
        href: (id) => `/champion/${championSlug(getChampionName(championData, id))}/`,
      }),
    [tiers, totalSlots, championData],
  );

  const sorted = useMemo(() => {
    // Tier assignment above still sees the full cohort - hiding low-sample
    // rows must not promote what remains
    let filtered = list;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) =>
        getChampionName(championData, c.champion_id).toLowerCase().includes(q),
      );
    }
    return sortRows(filtered, columns, sort);
  }, [list, columns, search, sort, championData]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs">
          {sorted.length} champion{sorted.length === 1 ? "" : "s"}
        </span>
        <SortControl options={sortOptions(columns)} sort={sort} onSort={toggle} />
        <div className="ml-auto">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search champion..."
            width={192}
          />
        </div>
      </div>

      <StatBoard
        columns={columns}
        rows={sorted}
        rowKey={(c) => c.champion_id}
        onRowClick={(c) => onSelectChampion(c.champion_id)}
        sort={sort}
        onSort={toggle}
        empty="No champions found"
        footnote={
          <>
            Score is the win rate the record supports, out of 100 - the floor of a 95% confidence
            interval, so a thin sample scores well below the rate it happened to produce. Tiers rank
            Score across the current filter. * fewer than 20 games - treat with caution.
          </>
        }
      />
    </div>
  );
}
