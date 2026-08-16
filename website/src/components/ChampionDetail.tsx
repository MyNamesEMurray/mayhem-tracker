import { useEffect, useMemo, useState } from "react";
import type { AugmentStatRow, ChampionStatRow, ItemPurchaseRow, ItemStatRow } from "../lib/api";
import {
  getAugmentName,
  getChampionName,
  getItemName,
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
} from "../lib/stats";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import RarityFilter, { type Rarity } from "./RarityFilter";
import TierBadge from "./TierBadge";
import WinRateBar from "./WinRateBar";

const RARITIES: { key: string; label: string; color: string }[] = [
  { key: "kPrismatic", label: "Prismatic", color: "text-fuchsia-400" },
  { key: "kGold", label: "Gold", color: "text-yellow-400" },
  { key: "kSilver", label: "Silver", color: "text-gray-300" },
];

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
  const augments = useMemo(
    () => championAugmentBreakdown(augmentRows, filters, championId),
    [augmentRows, filters, championId],
  );

  // Live-tracked purchase timings, narrowed to finished items and ordered by
  // when they're typically bought — only games recorded by the desktop app's
  // build-order watcher feed this, so it can be empty
  const buildPath = useMemo(() => {
    const all = championBuildPath(purchaseRows, filters, championId);
    return all
      .filter((e) => itemData[e.item_id]?.completed && e.picks >= 2)
      .slice(0, 7);
  }, [purchaseRows, filters, championId, itemData]);

  // The low-sample toggle and the panel search/rarity filters narrow the full
  // tables only; Core build and Best augments already rank with shrinkage
  const visibleItems = useMemo(() => {
    let list = minGames > 0 ? items.filter((i) => i.picks >= minGames) : items;
    if (itemSearch) {
      const q = itemSearch.toLowerCase();
      list = list.filter((i) => getItemName(itemData, i.item_id).toLowerCase().includes(q));
    }
    return list;
  }, [items, minGames, itemSearch, itemData]);

  const visibleAugments = useMemo(() => {
    let list = minGames > 0 ? augments.filter((a) => a.picks >= minGames) : augments;
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
        items,
        (i) => i.picks,
        (i) => i.wins,
        3,
        6,
      ),
    [items],
  );

  const augmentsByRarity = useMemo(() => {
    return RARITIES.map((r) => ({
      ...r,
      best: rankForBuild(
        augments.filter((a) => augmentData[a.augment_id]?.rarity === r.key),
        (a) => a.picks,
        (a) => a.wins,
        2,
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
            <p className="text-sm text-lol-text">No item data yet.</p>
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
                      className={`text-xs mt-1 ${
                        low ? "text-lol-text" : "text-lol-text-bright"
                      }`}
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
                  <p className="text-xs text-lol-text">No picks yet</p>
                ) : (
                  <div className="space-y-3">
                    {r.best.map((a) => (
                      <div key={a.augment_id} className="flex items-center gap-2.5">
                        <AugmentIcon
                          augmentData={augmentData}
                          augmentId={a.augment_id}
                          size={30}
                        />
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
              const min = Math.round(e.avgBuyS / 60);
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
                    title={`${getItemName(itemData, e.item_id)} — bought in ${e.picks} tracked games`}
                  >
                    <span className="rounded-md overflow-hidden leading-none">
                      <ItemIcon itemData={itemData} itemId={e.item_id} size={40} />
                    </span>
                    <span className="text-[11px] text-lol-gold mt-1">~{min} min</span>
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
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <h2 className={LABEL}>All items</h2>
            <div className="ml-auto">
              <SearchBox value={itemSearch} onChange={setItemSearch} placeholder="Search item..." width={150} />
            </div>
          </div>
          <table className="table-fixed w-full border-collapse">
            <thead className="bg-lol-dark/50">
              <tr>
                <th className={`px-3 py-1.5 text-left ${LABEL}`}>Item</th>
                <th className={`w-[72px] px-3 py-1.5 text-left ${LABEL}`}>Games</th>
                <th className={`w-[140px] px-3 py-1.5 text-left ${LABEL}`}>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((i) => (
                <tr key={i.item_id} className="border-t border-lol-border/50">
                  <td className="px-3 py-1.5">
                    <ItemIcon itemData={itemData} itemId={i.item_id} size={24} showName />
                  </td>
                  <td className="px-3 py-1.5 text-[13px] text-lol-text-bright">{i.picks}</td>
                  <td className="px-3 py-1.5">
                    <WinRateBar wins={i.wins} total={i.picks} />
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
              <SearchBox value={augSearch} onChange={setAugSearch} placeholder="Search..." width={110} />
            </div>
          </div>
          <table className="table-fixed w-full border-collapse">
            <thead className="bg-lol-dark/50">
              <tr>
                <th className={`px-3 py-1.5 text-left ${LABEL}`}>Augment</th>
                <th className={`w-[72px] px-3 py-1.5 text-left ${LABEL}`}>Picks</th>
                <th className={`w-[140px] px-3 py-1.5 text-left ${LABEL}`}>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {visibleAugments.map((a) => (
                <tr key={a.augment_id} className="border-t border-lol-border/50">
                  <td className="px-3 py-1.5">
                    <AugmentIcon
                      augmentData={augmentData}
                      augmentId={a.augment_id}
                      size={24}
                      showName
                      wrap
                    />
                  </td>
                  <td className="px-3 py-1.5 text-[13px] text-lol-text-bright">{a.picks}</td>
                  <td className="px-3 py-1.5">
                    <WinRateBar wins={a.wins} total={a.picks} />
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
        Core build and best augments rank by win rate adjusted toward 50% for small samples.
        * fewer than 20 games — treat with caution.
      </p>
    </div>
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
