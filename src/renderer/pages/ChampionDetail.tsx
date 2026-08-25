import { useEffect, useMemo, useState } from "react";
import { PANEL, LABEL } from "../../shared/ui/primitives";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useUrlStatsFilters } from "../hooks/useStatsFilters";
import {
  useAugmentData,
  useChampionData,
  useItemData,
  getAugmentName,
  getChampionName,
} from "../hooks/useChampions";
import type { AugmentStats, ChampionStats, ItemStats } from "../lib/types";
import {
  assignTiers,
  rankForBuild,
  score,
  LIST_MIN_PICKS,
  MIN_SAMPLE,
  winRate,
} from "../../shared/score";
import RarityFilter, { type Rarity } from "../../shared/ui/RarityFilter";
import SearchField from "../../shared/ui/SearchField";
import { formatAvg, formatPatch, kdaColor } from "../lib/format";
import {
  resolveSource,
  useSharingEnabled,
  useStatsSource,
  type StatsSource,
} from "../components/SourceSwitch";
import ChampionIcon from "../../shared/ui/ChampionIcon";
import AugmentIcon from "../../shared/ui/AugmentIcon";
import ItemIcon from "../components/ItemIcon";
import WinRateBar from "../../shared/ui/WinRateBar";
import TierBadge from "../../shared/ui/TierBadge";
import PatchSelect from "../components/PatchSelect";
import { useCommunityPatches } from "../hooks/useCommunityPatches";
import QueueSelect from "../components/QueueSelect";

// Same floors the website and the prerendered pages use
const ITEM_MIN_GAMES = 3;
const AUGMENT_MIN_PICKS = 3;

// A champion on a fresh patch has almost nothing behind it, and a build read
// off six games is noise. Same rule as the website: reach back a patch at a
// time until there's enough to say something, say so, and let it be pinned
// back to the single patch.
const AUTO_WIDEN_MIN_GAMES = MIN_SAMPLE;
const AUTO_WIDEN_MAX_PATCHES = 3;

// What a long-tail list is ranked by. Score is the default because "what
// works" is the question these panels answer; picks answers "what is popular",
// which the count in each row already shows.
export type SortBy = "score" | "winRate" | "picks";

const SORT_LABELS: Record<SortBy, string> = {
  score: "Score",
  winRate: "Win rate",
  picks: "Games",
};

const SCORE_HINT =
  "The win rate this record supports, out of 100 — the floor of a 95% confidence interval, so a small sample scores well below the win rate it happened to produce";

function sortRows<T extends { picks: number; wins: number }>(rows: T[], by: SortBy): T[] {
  const value = (r: T) =>
    by === "picks" ? r.picks : by === "winRate" ? winRate(r.wins, r.picks) : score(r.wins, r.picks);
  return [...rows].sort((a, b) => value(b) - value(a));
}

interface Bundle {
  champions: ChampionStats[];
  augments: AugmentStats[];
  items: ItemStats[];
}

// Averages come back already rounded, without the totals behind them, so they
// merge weighted by games rather than re-derived
function mergeChampions(a: ChampionStats[], b: ChampionStats[]): ChampionStats[] {
  const map = new Map<number, ChampionStats>();
  for (const list of [a, b]) {
    for (const c of list) {
      const e = map.get(c.champion_id);
      if (!e) {
        map.set(c.champion_id, { ...c });
        continue;
      }
      const games = e.games + c.games;
      const weighted = (x: number, y: number) =>
        games > 0 ? (x * e.games + y * c.games) / games : 0;
      e.avg_kills = weighted(e.avg_kills, c.avg_kills);
      e.avg_deaths = weighted(e.avg_deaths, c.avg_deaths);
      e.avg_assists = weighted(e.avg_assists, c.avg_assists);
      e.avg_damage = Math.round(weighted(e.avg_damage, c.avg_damage));
      e.avg_gold = Math.round(weighted(e.avg_gold, c.avg_gold));
      e.games = games;
      e.wins += c.wins;
      e.kills += c.kills;
      e.deaths += c.deaths;
      e.assists += c.assists;
      e.double_kills += c.double_kills;
      e.triple_kills += c.triple_kills;
      e.quadra_kills += c.quadra_kills;
      e.penta_kills += c.penta_kills;
    }
  }
  return [...map.values()];
}

function mergeCounts<T extends { picks: number; wins: number }>(
  a: T[],
  b: T[],
  key: (t: T) => number,
): T[] {
  const map = new Map<number, T>();
  for (const list of [a, b]) {
    for (const row of list) {
      const e = map.get(key(row));
      if (!e) map.set(key(row), { ...row });
      else {
        e.picks += row.picks;
        e.wins += row.wins;
      }
    }
  }
  return [...map.values()].sort((x, y) => y.picks - x.picks);
}

const mergeBundles = (a: Bundle, b: Bundle): Bundle => ({
  champions: mergeChampions(a.champions, b.champions),
  augments: mergeCounts(a.augments, b.augments, (x) => x.augment_id),
  items: mergeCounts(a.items, b.items, (x) => x.item_id),
});

const RARITIES = [
  { key: "kPrismatic", label: "Prismatic", color: "text-fuchsia-300" },
  { key: "kGold", label: "Gold", color: "text-amber-300" },
  { key: "kSilver", label: "Silver", color: "text-slate-300" },
] as const;

// The full champion page from mayhemstats.com, in the app: tier and score,
// the core build, the best augments per rarity, and the long tail underneath.
// Reading a build was the one thing that still sent people to the browser.
export default function ChampionDetail() {
  const { championId: idParam } = useParams();
  const championId = Number(idParam);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // An explicit ?source= wins, so a link opens what it says. Without one the
  // page follows the app-wide switch rather than snapping back to your own
  // games.
  const [appSource] = useStatsSource();
  const sharing = useSharingEnabled();
  const sourceParam = searchParams.get("source");
  const requested: StatsSource =
    sourceParam === "community" ? "community" : sourceParam === "mine" ? "mine" : appSource;
  // The same give-to-get gate the switch enforces: a link asking for the
  // community pool doesn't get it while sharing is off
  const source: StatsSource = resolveSource(requested, sharing);
  const { patch, setPatch, queue, setQueue } = useUrlStatsFilters();
  const communityPatches = useCommunityPatches(source);

  const champData = useChampionData();
  const augData = useAugmentData();
  const itemData = useItemData(patch);
  const [champions, setChampions] = useState<ChampionStats[] | null>(null);
  const [augments, setAugments] = useState<AugmentStats[] | null>(null);
  const [items, setItems] = useState<ItemStats[] | null>(null);

  // The ordered patch list to reach back through — the community source knows
  // patches this install has never played
  const [localPatches, setLocalPatches] = useState<string[]>([]);
  useEffect(() => {
    if (source === "community") return;
    window.api.getMatchFilterOptions().then((o) => setLocalPatches(o.patches));
  }, [source]);
  const patchList = source === "community" ? (communityPatches ?? []) : localPatches;

  // Set when the reader pins the view back to the single selected patch
  const [pinned, setPinned] = useState(false);
  useEffect(() => setPinned(false), [championId, patch, queue, source]);
  const [widenedOver, setWidenedOver] = useState<string[] | null>(null);
  const [gamesOnSelected, setGamesOnSelected] = useState(0);

  useEffect(() => {
    let alive = true;
    const fetchFor = async (p: string | undefined): Promise<Bundle> => {
      if (source === "community") {
        const [all, detail] = await Promise.all([
          window.api.getCommunityChampionStats(p, queue),
          window.api.getCommunityChampionDetail(championId, p, queue),
        ]);
        return { champions: all, augments: detail.augments, items: detail.items };
      }
      const [all, augs, its] = await Promise.all([
        window.api.getChampionStats(p, queue),
        window.api.getAugmentStats(championId, p, queue),
        window.api.getChampionItemStats(championId, p, queue),
      ]);
      return { champions: all, augments: augs, items: its };
    };

    const gamesFor = (b: Bundle) =>
      b.champions.find((c) => c.champion_id === championId)?.games ?? 0;

    const load = async () => {
      let acc = await fetchFor(patch);
      if (!alive) return;
      const onSelected = gamesFor(acc);
      const used = patch ? [patch] : [];

      // "All patches" is already as wide as it goes, and a pinned view was
      // asked for explicitly
      if (patch && !pinned) {
        let i = patchList.indexOf(patch);
        while (
          i >= 0 &&
          gamesFor(acc) < AUTO_WIDEN_MIN_GAMES &&
          used.length < AUTO_WIDEN_MAX_PATCHES &&
          i + 1 < patchList.length
        ) {
          i += 1;
          const older = await fetchFor(patchList[i]);
          if (!alive) return;
          acc = mergeBundles(acc, older);
          used.push(patchList[i]);
        }
      }

      if (!alive) return;
      setGamesOnSelected(onSelected);
      setWidenedOver(used.length > 1 ? used : null);
      setChampions(acc.champions);
      setAugments(acc.augments);
      setItems(acc.items);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [championId, patch, queue, source, patchList, pinned]);

  const champ = champions?.find((c) => c.champion_id === championId) ?? null;

  // Tier is a rank within the whole board under these filters, so it needs
  // every champion, not just this one
  const tier = useMemo(() => {
    if (!champions || champions.length === 0) return null;
    const tiers = assignTiers(
      champions,
      (c) => score(c.wins, c.games),
      (c) => c.champion_id,
    );
    return tiers.get(championId) ?? null;
  }, [champions, championId]);

  // Components sit out of the build lists: they are what a finished item was
  // on the way to, not something anyone set out to build. An id the item data
  // doesn't know is treated as finished, so a gap in what loaded never hides
  // real data — and the lists fill in rather than flashing empty.
  const finishedItems = useMemo(
    () => (items ?? []).filter((i) => itemData[i.item_id]?.completed !== false),
    [items, itemData],
  );
  const hasComponents = (items ?? []).length !== finishedItems.length;
  const [showComponents, setShowComponents] = useState(false);

  const coreBuild = useMemo(
    () =>
      rankForBuild(
        finishedItems,
        (i) => i.picks,
        (i) => i.wins,
        ITEM_MIN_GAMES,
        6,
      ),
    [finishedItems],
  );

  const augmentsByRarity = useMemo(
    () =>
      RARITIES.map((r) => ({
        ...r,
        best: rankForBuild(
          (augments ?? []).filter((a) => augData[a.augment_id]?.rarity === r.key),
          (a) => a.picks,
          (a) => a.wins,
          AUGMENT_MIN_PICKS,
          4,
        ),
      })),
    [augments, augData],
  );

  // Panel controls, matching the website's: search both lists, filter augments
  // by rarity, and choose what the list is ranked by
  const [itemSearch, setItemSearch] = useState("");
  const [augSearch, setAugSearch] = useState("");
  const [augRarity, setAugRarity] = useState<Rarity>("all");
  const [itemSort, setItemSort] = useState<SortBy>("score");
  const [augSort, setAugSort] = useState<SortBy>("score");

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const list = (showComponents ? (items ?? []) : finishedItems).filter(
      (i) =>
        i.picks >= LIST_MIN_PICKS &&
        (q ? (itemData[i.item_id]?.name ?? "").toLowerCase().includes(q) : true),
    );
    return sortRows(list, itemSort);
  }, [items, finishedItems, showComponents, itemSearch, itemData, itemSort]);

  const visibleAugments = useMemo(() => {
    const q = augSearch.trim().toLowerCase();
    const list = (augments ?? []).filter((a) => {
      if (a.picks < LIST_MIN_PICKS) return false;
      if (augRarity !== "all" && augData[a.augment_id]?.rarity !== augRarity) return false;
      return q ? getAugmentName(augData, a.augment_id).toLowerCase().includes(q) : true;
    });
    return sortRows(list, augSort);
  }, [augments, augSearch, augRarity, augData, augSort]);

  const name = getChampionName(champData, championId);
  const backTo = `/champions${source === "community" ? "?source=community" : ""}`;

  const header = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <button
        onClick={() => navigate(backTo)}
        className="text-sm text-lol-gold hover:text-lol-gold-light cursor-pointer"
      >
        ← All champions
      </button>
      <div className="flex items-center gap-2">
        <QueueSelect value={queue} onChange={setQueue} />
        <PatchSelect value={patch} onChange={setPatch} options={communityPatches} />
      </div>
    </div>
  );

  if (!champions || !augments || !items) {
    return (
      <div className="w-full space-y-4">
        {header}
        <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>Loading…</div>
      </div>
    );
  }

  if (!champ) {
    return (
      <div className="w-full space-y-4">
        {header}
        <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
          No {source === "community" ? "community" : ""} games recorded for {name} under these
          filters.
        </div>
      </div>
    );
  }

  const kda = (champ.kills + champ.assists) / Math.max(champ.deaths, 1);
  const perGame = (n: number) => (champ.games > 0 ? n / champ.games : 0);
  const lowSample = champ.games < MIN_SAMPLE;

  return (
    <div className="w-full space-y-4">
      {header}

      {widenedOver && (
        <div className="flex items-start gap-3 rounded-xl border border-lol-gold/25 bg-lol-gold/[0.06] px-4 py-3">
          <span className="text-lol-gold text-sm mt-[1px]">ⓘ</span>
          <p className="text-[13px] leading-relaxed text-lol-text">
            <span className="text-lol-text-bright">
              Showing patches {formatPatch(widenedOver[widenedOver.length - 1])}–
              {formatPatch(widenedOver[0])}.
            </span>{" "}
            {formatPatch(widenedOver[0])} alone has{" "}
            {gamesOnSelected === 0
              ? "no games"
              : `${gamesOnSelected} game${gamesOnSelected === 1 ? "" : "s"}`}{" "}
            on this champion.
            <button
              onClick={() => setPinned(true)}
              className="ml-2 text-lol-gold hover:text-lol-gold-light cursor-pointer"
            >
              Use only {formatPatch(widenedOver[0])}
            </button>
          </p>
        </div>
      )}

      {/* Hero */}
      <div className={`${PANEL} p-5`}>
        <div className="flex flex-wrap items-center gap-4">
          <span className="rounded-full ring-2 ring-lol-gold/40 shrink-0 leading-none">
            <ChampionIcon championId={championId} size={64} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-extrabold text-lol-gold-light m-0">{name}</h1>
              {tier && <TierBadge tier={tier} games={champ.games} />}
              <span className="text-[13px] text-lol-text-bright font-semibold">
                {score(champ.wins, champ.games).toFixed(1)}
              </span>
            </div>
            <p className="text-[13px] text-lol-text mt-0.5">
              {champ.games} games · KDA{" "}
              <span className={`font-semibold ${kdaColor(kda)}`}>{kda.toFixed(2)}</span> (
              {formatAvg(perGame(champ.kills))} / {formatAvg(perGame(champ.deaths))} /{" "}
              {formatAvg(perGame(champ.assists))}){source === "community" && " · community games"}
            </p>
          </div>
          <div className="w-full min-[701px]:w-[200px] min-[701px]:ml-auto">
            <p className={`${LABEL} mb-1.5`}>Win rate</p>
            <WinRateBar wins={champ.wins} total={champ.games} />
          </div>
        </div>
        {lowSample && (
          <p className="text-[11px] text-lol-text mt-3">
            Under {MIN_SAMPLE} games — read this as directional rather than settled.
          </p>
        )}
      </div>

      {/* Core build + best augments */}
      <div className="grid grid-cols-1 min-[981px]:grid-cols-[1fr_2fr] gap-4">
        <div className={`${PANEL} p-5`}>
          <h2 className={`${LABEL} mb-3`}>Core build</h2>
          {coreBuild.length === 0 ? (
            <p className="text-sm text-lol-text">
              No item has a winning record over {ITEM_MIN_GAMES}+ games yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3.5">
              {coreBuild.map((i) => {
                const wr = winRate(i.wins, i.picks);
                const low = i.picks < MIN_SAMPLE;
                return (
                  <div
                    key={i.item_id}
                    className="flex flex-col items-center w-[52px]"
                    title={`${itemData[i.item_id]?.name ?? `Item ${i.item_id}`} — ${i.picks} games`}
                  >
                    <span className="rounded-md overflow-hidden leading-none">
                      <ItemIcon itemId={i.item_id} size={44} patch={patch} />
                    </span>
                    <span
                      className={`text-xs mt-1 ${low ? "text-lol-text" : "text-lol-text-bright"}`}
                    >
                      {wr.toFixed(0)}%{low ? "*" : ""}
                    </span>
                    <span className="text-[10px] text-lol-text">{i.picks} g</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${PANEL} p-5`}>
          <h2 className={`${LABEL} mb-3`}>Best augments</h2>
          <div className="grid grid-cols-1 min-[701px]:grid-cols-3 gap-5">
            {augmentsByRarity.map((r) => (
              <div key={r.key}>
                <p className={`text-[11px] uppercase tracking-[.08em] mb-2 ${r.color}`}>
                  {r.label}
                </p>
                {r.best.length === 0 ? (
                  <p className="text-xs text-lol-text">Nothing winning yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {r.best.map((a) => (
                      <div key={a.augment_id} className="flex items-center gap-2">
                        <AugmentIcon augmentId={a.augment_id} size={26} />
                        <span className="text-xs text-lol-text-bright truncate min-w-0">
                          {getAugmentName(augData, a.augment_id)}
                        </span>
                        <span className="text-[11px] text-lol-text ml-auto shrink-0 inline-flex justify-end">
                          <span className="tabular-nums">
                            {winRate(a.wins, a.picks).toFixed(0)}%
                          </span>
                          <span className="w-2 text-left">{a.picks < MIN_SAMPLE ? "*" : ""}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The long tail: everything, not just what's recommended */}
      <div className="grid grid-cols-1 min-[981px]:grid-cols-2 gap-4">
        <StatTable
          title="All items"
          search={itemSearch}
          onSearch={setItemSearch}
          placeholder="Search item..."
          sort={itemSort}
          onSort={setItemSort}
          filter={
            hasComponents ? (
              <button
                type="button"
                onClick={() => setShowComponents((v) => !v)}
                aria-pressed={showComponents}
                title="Components — Ruby Crystal, Boots, Recurve Bow — carry a win rate from sitting in an inventory, not from being built on purpose"
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  showComponents
                    ? "bg-lol-gold/20 text-lol-gold-light"
                    : "text-lol-text hover:text-lol-gold-light"
                }`}
              >
                Components
              </button>
            ) : undefined
          }
          rows={visibleItems.map((i) => ({
            key: i.item_id,
            icon: <ItemIcon itemId={i.item_id} size={24} patch={patch} />,
            name: itemData[i.item_id]?.name ?? `Item ${i.item_id}`,
            picks: i.picks,
            wins: i.wins,
          }))}
        />
        <StatTable
          title="All augments"
          search={augSearch}
          onSearch={setAugSearch}
          placeholder="Search augment..."
          sort={augSort}
          onSort={setAugSort}
          filter={<RarityFilter value={augRarity} onChange={setAugRarity} />}
          rows={visibleAugments.map((a) => ({
            key: a.augment_id,
            icon: <AugmentIcon augmentId={a.augment_id} size={24} />,
            name: getAugmentName(augData, a.augment_id),
            picks: a.picks,
            wins: a.wins,
          }))}
        />
      </div>

      <p className="text-[11px] text-lol-text">
        Lists hide anything under {LIST_MIN_PICKS} picks — too thin to rank. Entries marked * fall
        under {MIN_SAMPLE} games. Score is the win rate the record supports, out of 100: the floor
        of a 95% confidence interval, so 100% over 5 games scores below 60% over 2,600. Champions,
        items and augments all rank by it. Components are left out of the build lists — items that
        transform, like Manamune, are not components — and the same method runs on mayhemstats.com.
      </p>
    </div>
  );
}

function StatTable({
  title,
  rows,
  search,
  onSearch,
  placeholder,
  sort,
  onSort,
  filter,
}: {
  title: string;
  rows: { key: number; icon: React.ReactNode; name: string; picks: number; wins: number }[];
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  sort: SortBy;
  onSort: (s: SortBy) => void;
  filter?: React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 10);

  return (
    <div className={`${PANEL} p-5`}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h2 className={`${LABEL} mr-auto`}>{title}</h2>
        {filter}
        {/* The search takes the row's leftover rather than a fixed width it
            cannot give back. A fixed width wraps the moment the panel is
            narrower than it wants and lands on a row of its own; growing
            keeps it up here while 96px remain, and fills the row when it does
            drop. The slack goes to the title's margin, not the search's, so
            the search sits flush right when the cap bites on a wide panel
            instead of leaving a hole beside it on a wrapped one. */}
        <div className="flex-1 min-w-[96px] max-w-[280px]">
          <SearchField
            value={search}
            onChange={onSearch}
            placeholder={placeholder}
            clearable={false}
          />
        </div>
      </div>
      <div className="flex items-center gap-1 mb-3">
        <span className="text-[10px] uppercase tracking-[.08em] text-lol-text mr-1">Rank by</span>
        {(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
          <button
            key={key}
            onClick={() => onSort(key)}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
              sort === key
                ? "bg-lol-gold/20 text-lol-gold-light"
                : "text-lol-text hover:text-lol-gold-light"
            }`}
          >
            {SORT_LABELS[key]}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-lol-text">Nothing matches.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map((r) => (
              <div key={r.key} className="flex items-center gap-2.5 h-7">
                <span className="shrink-0 leading-none">{r.icon}</span>
                <span className="text-xs text-lol-text-bright truncate min-w-0" title={r.name}>
                  {r.name}
                </span>
                <span className="text-[11px] text-lol-text ml-auto shrink-0">{r.picks}x</span>
                <span
                  className="text-[11px] font-medium tabular-nums text-lol-text-bright shrink-0 w-8 text-right"
                  title={SCORE_HINT}
                >
                  {score(r.wins, r.picks).toFixed(1)}
                </span>
                <span className="shrink-0">
                  <WinRateBar wins={r.wins} total={r.picks} />
                </span>
              </div>
            ))}
          </div>
          {rows.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs text-lol-gold hover:text-lol-gold-light cursor-pointer"
            >
              {showAll ? "Show top 10" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
