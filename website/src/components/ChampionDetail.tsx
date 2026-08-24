import { useEffect, useMemo, useState } from "react";
import type { AugmentStatRow, ChampionStatRow, ItemPurchaseRow, ItemStatRow } from "../lib/api";
import {
  getAugmentName,
  getChampionName,
  getItemName,
  isFinishedItem,
  loadItemData,
  type AugmentData,
  type ChampionData,
  type ItemData,
} from "../lib/dragon";
import {
  aggregateChampions,
  assignTiers,
  championAugmentBreakdown,
  championBuildPath,
  championItemBreakdown,
  kdaRampClass,
  kdaRatio,
  rankForBuild,
  score,
  type Filters,
  LIST_MIN_PICKS,
} from "../lib/stats";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import RarityFilter, { type Rarity } from "./RarityFilter";
import TierBadge from "./TierBadge";
import WinRateBar from "./WinRateBar";

// A build entry needs this many games behind it before it can be recommended
// at all — below that a win rate is noise, however good it looks
const ITEM_MIN_GAMES = 3;
const AUGMENT_MIN_PICKS = 3;

const RARITIES: { key: string; label: string; color: string }[] = [
  { key: "kPrismatic", label: "Prismatic", color: "text-fuchsia-400" },
  { key: "kGold", label: "Gold", color: "text-yellow-400" },
  { key: "kSilver", label: "Silver", color: "text-gray-300" },
];

// Build-path slots read as their purchase position ("1st", "2nd", ...)
// rather than a clock time — 11th–13th take "th" against the usual rule.
function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

const PANEL = "bg-lol-card rounded-xl border border-lol-border/60";
const LABEL = "text-[11px] font-medium uppercase tracking-[.08em] text-lol-text";

export default function ChampionDetail({
  championId,
  championRows,
  augmentRows,
  itemRows,
  purchaseRows,
  filters,
  minGames = 0,
  championData,
  augmentData,
  onBack,
}: {
  championId: number;
  championRows: ChampionStatRow[];
  augmentRows: AugmentStatRow[];
  itemRows: ItemStatRow[];
  purchaseRows: ItemPurchaseRow[];
  filters: Filters;
  minGames?: number;
  championData: ChampionData;
  augmentData: AugmentData;
  onBack: () => void;
}) {
  const [itemData, setItemData] = useState<ItemData>({});
  const [itemSearch, setItemSearch] = useState("");
  const [showComponents, setShowComponents] = useState(false);
  const [augSearch, setAugSearch] = useState("");
  const [augRarity, setAugRarity] = useState<Rarity>("all");
  useEffect(() => {
    loadItemData().then(setItemData);
  }, []);

  // The champion's aggregate line plus its tier within the full cohort
  const { champ, tier } = useMemo(() => {
    const list = aggregateChampions(championRows, filters);
    const tiers = assignTiers(
      list,
      (c) => score(c.wins, c.games),
      (c) => c.champion_id,
    );
    return {
      champ: list.find((c) => c.champion_id === championId) ?? null,
      tier: tiers.get(championId) ?? null,
    };
  }, [championRows, filters, championId]);

  const items = useMemo(
    () => championItemBreakdown(itemRows, filters, championId),
    [itemRows, filters, championId],
  );
  // Components sit out of the build lists by default — they are what a
  // finished item was on the way to, not something anyone set out to build.
  // Until the item data arrives every id looks finished, so the lists fill in
  // rather than flashing empty.
  const finishedItems = useMemo(
    () => items.filter((i) => isFinishedItem(itemData, i.item_id)),
    [items, itemData],
  );
  const hasComponents = finishedItems.length !== items.length;
  const augments = useMemo(
    () => championAugmentBreakdown(augmentRows, filters, championId),
    [augmentRows, filters, championId],
  );

  // Live-tracked purchase timings, narrowed to finished items and ordered by
  // when they're typically bought — only games recorded by the desktop app's
  // build-order watcher feed this, so it can be empty
  const buildPath = useMemo(() => {
    const all = championBuildPath(purchaseRows, filters, championId);
    return all.filter((e) => itemData[e.item_id]?.completed && e.picks >= 2).slice(0, 7);
  }, [purchaseRows, filters, championId, itemData]);

  // The low-sample toggle and the panel search/rarity filters narrow the full
  // tables only; Core build and Best augments already rank by Score
  const visibleItems = useMemo(() => {
    let list = (showComponents ? items : finishedItems).filter(
      (i) => i.picks >= Math.max(minGames, LIST_MIN_PICKS),
    );
    if (itemSearch) {
      const q = itemSearch.toLowerCase();
      list = list.filter((i) => getItemName(itemData, i.item_id).toLowerCase().includes(q));
    }
    return list;
  }, [items, finishedItems, showComponents, minGames, itemSearch, itemData]);

  const visibleAugments = useMemo(() => {
    let list = augments.filter((a) => a.picks >= Math.max(minGames, LIST_MIN_PICKS));
    if (augRarity !== "all") {
      list = list.filter((a) => augmentData[a.augment_id]?.rarity === augRarity);
    }
    if (augSearch) {
      const q = augSearch.toLowerCase();
      list = list.filter((a) =>
        getAugmentName(augmentData, a.augment_id).toLowerCase().includes(q),
      );
    }
    return list;
  }, [augments, minGames, augRarity, augSearch, augmentData]);

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

  const augmentsByRarity = useMemo(() => {
    return RARITIES.map((r) => ({
      ...r,
      best: rankForBuild(
        augments.filter((a) => augmentData[a.augment_id]?.rarity === r.key),
        (a) => a.picks,
        (a) => a.wins,
        AUGMENT_MIN_PICKS,
        4,
      ),
    }));
  }, [augments, augmentData]);

  const name = getChampionName(championData, championId);

  if (!champ) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-lol-gold hover:text-lol-gold-light">
          ← All champions
        </button>
        <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
          No games recorded for {name} under the current filters.
        </div>
      </div>
    );
  }

  const kda = kdaRatio(champ.kills, champ.deaths, champ.assists);
  const avg = (n: number) => (champ.games > 0 ? n / champ.games : 0);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-lol-gold hover:text-lol-gold-light">
        ← All champions
      </button>

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
              <span className={`font-semibold ${kdaRampClass(kda)}`}>{kda.toFixed(2)}</span> (
              {avg(champ.kills).toFixed(1)} / {avg(champ.deaths).toFixed(1)} /{" "}
              {avg(champ.assists).toFixed(1)})
            </p>
          </div>
          <div className="herobar w-full min-[701px]:w-[200px] min-[701px]:ml-auto">
            <p className={`${LABEL} mb-1.5`}>Win rate</p>
            <WinRateBar wins={champ.wins} total={champ.games} />
          </div>
        </div>
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
                const wr = i.picks > 0 ? ((i.wins / i.picks) * 100).toFixed(0) : "0";
                const low = i.picks < 20;
                return (
                  <div
                    key={i.item_id}
                    className="flex flex-col items-center w-[52px]"
                    title={`${getItemName(itemData, i.item_id)} — ${i.picks} games`}
                  >
                    <span className="rounded-md overflow-hidden leading-none">
                      <ItemIcon itemData={itemData} itemId={i.item_id} size={44} />
                    </span>
                    <span
                      className={`text-xs mt-1 ${low ? "text-lol-text" : "text-lol-text-bright"}`}
                    >
                      {wr}%{low ? "*" : ""}
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
          <div className="g3 grid grid-cols-1 min-[701px]:grid-cols-3 gap-x-6 gap-y-5">
            {augmentsByRarity.map((r) => (
              <div key={r.key}>
                <p className={`text-[11px] uppercase tracking-[.08em] mb-2 ${r.color}`}>
                  {r.label}
                </p>
                {r.best.length === 0 ? (
                  <p className="text-xs text-lol-text">Nothing winning yet</p>
                ) : (
                  <div className="space-y-3">
                    {r.best.map((a) => (
                      <div key={a.augment_id} className="flex items-center gap-2.5">
                        <AugmentIcon augmentData={augmentData} augmentId={a.augment_id} size={30} />
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[13px] truncate leading-tight ${r.color}`}
                            title={getAugmentName(augmentData, a.augment_id)}
                          >
                            {getAugmentName(augmentData, a.augment_id)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 max-w-44">
                              <WinRateBar wins={a.wins} total={a.picks} />
                            </div>
                            <span className="text-[11px] text-lol-text shrink-0 w-12">
                              {a.picks} g
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Typical build path — from live build-order tracking; hidden until
          tracked games exist for this champion */}
      {buildPath.length >= 2 && (
        <div className={`${PANEL} p-5`}>
          <div className="flex items-baseline gap-2.5 mb-3">
            <h2 className={LABEL}>Typical build path</h2>
            <span className="text-[11px] text-lol-text">
              purchase order recorded live by MayhemStats Tracker players
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
            {buildPath.map((e, i) => {
              const wr = e.picks > 0 ? ((e.wins / e.picks) * 100).toFixed(0) : "0";
              const low = e.picks < 20;
              return (
                <div key={e.item_id} className="flex items-center gap-x-2">
                  {/* Hidden on narrow screens, where wrapping would leave a
                      row starting with an arrow */}
                  {i > 0 && (
                    <span className="hidden min-[701px]:inline text-lol-text/50 text-sm mb-5">
                      →
                    </span>
                  )}
                  <div
                    className="flex flex-col items-center w-[56px]"
                    title={`${getItemName(itemData, e.item_id)} — ${ordinal(i + 1)} item, bought in ${e.picks} tracked games`}
                  >
                    <span className="rounded-md overflow-hidden leading-none">
                      <ItemIcon itemData={itemData} itemId={e.item_id} size={40} />
                    </span>
                    <span className="text-[11px] text-lol-gold mt-1">{ordinal(i + 1)}</span>
                    <span
                      className={`text-[10px] ${low ? "text-lol-text" : "text-lol-text-bright"}`}
                    >
                      {wr}%{low ? "*" : ""} · {e.picks} g
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full tables */}
      <div className="grid grid-cols-1 min-[981px]:grid-cols-2 gap-4">
        <div className={`${PANEL} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-3">
            <h2 className={LABEL}>All items</h2>
            {hasComponents && (
              <ToggleChip
                active={showComponents}
                onClick={() => setShowComponents((v) => !v)}
                title="Components — Ruby Crystal, Boots, Recurve Bow — carry a win rate from sitting in an inventory, not from being built on purpose"
              >
                Components
              </ToggleChip>
            )}
            <div className="ml-auto">
              <SearchBox
                value={itemSearch}
                onChange={setItemSearch}
                placeholder="Search item..."
                width={150}
              />
            </div>
          </div>
          <table className="table-fixed w-full border-collapse">
            <thead className="bg-lol-dark/50">
              <tr>
                <th className={`px-2 sm:px-3 py-1.5 text-left ${LABEL}`}>Item</th>
                <th
                  className={`${COL_GAMES} px-1 sm:px-3 py-1.5 text-left whitespace-nowrap ${LABEL}`}
                >
                  Games
                </th>
                <th
                  className={`${COL_SCORE} px-1 sm:px-3 py-1.5 text-left whitespace-nowrap ${LABEL}`}
                  title={SCORE_HINT}
                >
                  Score
                </th>
                <th
                  className={`${COL_RATE} px-2 sm:px-3 py-1.5 text-left whitespace-nowrap ${LABEL}`}
                >
                  Win rate
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((i) => (
                <tr key={i.item_id} className="border-t border-lol-border/50">
                  <td className="px-2 sm:px-3 py-1.5">
                    <ItemIcon itemData={itemData} itemId={i.item_id} size={24} showName wrap />
                  </td>
                  <td className="px-1 sm:px-3 py-1.5 text-[13px] text-lol-text-bright tabular-nums">
                    {i.picks}
                  </td>
                  <td className="px-1 sm:px-3 py-1.5">
                    <ScoreCell wins={i.wins} total={i.picks} />
                  </td>
                  <td className="px-2 sm:px-3 py-1.5">
                    <WinRateBar wins={i.wins} total={i.picks} meterFrom="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleItems.length === 0 && (
            <div className="py-6 text-center text-sm text-lol-text">
              {items.length > 0 ? "No items match the current filters" : "No item data"}
            </div>
          )}
        </div>

        <div className={`${PANEL} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3">
            <h2 className={LABEL}>All augments</h2>
            <div className="flex items-center gap-1.5 ml-2">
              <RarityFilter value={augRarity} onChange={setAugRarity} compact />
            </div>
            <div className="ml-auto">
              <SearchBox
                value={augSearch}
                onChange={setAugSearch}
                placeholder="Search..."
                width={110}
              />
            </div>
          </div>
          <table className="table-fixed w-full border-collapse">
            <thead className="bg-lol-dark/50">
              <tr>
                <th className={`px-2 sm:px-3 py-1.5 text-left ${LABEL}`}>Augment</th>
                <th
                  className={`${COL_GAMES} px-1 sm:px-3 py-1.5 text-left whitespace-nowrap ${LABEL}`}
                >
                  Picks
                </th>
                <th
                  className={`${COL_SCORE} px-1 sm:px-3 py-1.5 text-left whitespace-nowrap ${LABEL}`}
                  title={SCORE_HINT}
                >
                  Score
                </th>
                <th
                  className={`${COL_RATE} px-2 sm:px-3 py-1.5 text-left whitespace-nowrap ${LABEL}`}
                >
                  Win rate
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleAugments.map((a) => (
                <tr key={a.augment_id} className="border-t border-lol-border/50">
                  <td className="px-2 sm:px-3 py-1.5">
                    <AugmentIcon
                      augmentData={augmentData}
                      augmentId={a.augment_id}
                      size={24}
                      showName
                      wrap
                    />
                  </td>
                  <td className="px-1 sm:px-3 py-1.5 text-[13px] text-lol-text-bright tabular-nums">
                    {a.picks}
                  </td>
                  <td className="px-1 sm:px-3 py-1.5">
                    <ScoreCell wins={a.wins} total={a.picks} />
                  </td>
                  <td className="px-2 sm:px-3 py-1.5">
                    <WinRateBar wins={a.wins} total={a.picks} meterFrom="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleAugments.length === 0 && (
            <div className="py-6 text-center text-sm text-lol-text">
              {augments.length > 0 ? "No augments match the current filters" : "No augment data"}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-lol-text/70">
        Score is the win rate the record supports, out of 100: the floor of a 95% confidence
        interval, so 100% over 5 games scores below 60% over 2,600. Everything on the site ranks by
        it. Components are left out of the build lists — Manamune and Archangel's Staff stay, since
        they transform rather than build into anything. * fewer than 20 games — treat with caution.
      </p>
    </div>
  );
}

// Table columns are fixed-width so the numbers line up down the page, which
// leaves the name column whatever is left over. On a phone that was not
// enough and names came back as "Overlord'..." — so the number columns give
// up their padding and some width below `sm`, and names wrap to a second line
// instead of being cut.
const COL_GAMES = "w-[50px] sm:w-[72px]";
const COL_SCORE = "w-[44px] sm:w-[64px]";
const COL_RATE = "w-[84px] sm:w-[140px]";

const SCORE_HINT =
  "The win rate this record supports, out of 100 — the floor of a 95% confidence interval, so a small sample scores well below the win rate it happened to produce";

// The score carries no win/loss color: it is a confidence-adjusted number, and
// coloring it green at 50 would say something the win rate already says.
function ScoreCell({ wins, total }: { wins: number; total: number }) {
  return (
    <span className="text-[13px] font-medium tabular-nums text-lol-text-bright" title={SCORE_HINT}>
      {score(wins, total).toFixed(1)}
    </span>
  );
}

function ToggleChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? "border-lol-gold/50 bg-lol-gold/10 text-lol-text-bright"
          : "border-lol-border text-lol-text hover:text-lol-text-bright"
      }`}
    >
      {children}
    </button>
  );
}

// Local slim search input (the shared SearchInput carries a clear button and
// larger default width than these panel headers want)
function SearchBox({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input"
      style={{ width }}
    />
  );
}
