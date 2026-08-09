import { useEffect, useMemo, useState } from "react";
import type { AugmentStatRow, ChampionStatRow, ItemStatRow } from "../lib/api";
import {
  getChampionName,
  getItemName,
  loadItemData,
  type AugmentData,
  type ChampionData,
  type ItemData,
} from "../lib/dragon";

function getItemTitle(itemData: ItemData, id: number): string {
  return getItemName(itemData, id);
}
import {
  aggregateChampions,
  assignTiers,
  championAugmentBreakdown,
  championItemBreakdown,
  formatCompact,
  kdaRatio,
  rankForBuild,
  score,
  type Filters,
} from "../lib/stats";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import TierBadge from "./TierBadge";
import WinRateBar from "./WinRateBar";

const RARITIES: { key: string; label: string; color: string }[] = [
  { key: "kPrismatic", label: "Prismatic", color: "text-fuchsia-400" },
  { key: "kGold", label: "Gold", color: "text-yellow-400" },
  { key: "kSilver", label: "Silver", color: "text-gray-300" },
];

export default function ChampionDetail({
  championId,
  championRows,
  augmentRows,
  itemRows,
  filters,
  championData,
  augmentData,
  onBack,
}: {
  championId: number;
  championRows: ChampionStatRow[];
  augmentRows: AugmentStatRow[];
  itemRows: ItemStatRow[];
  filters: Filters;
  championData: ChampionData;
  augmentData: AugmentData;
  onBack: () => void;
}) {
  const [itemData, setItemData] = useState<ItemData>({});
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
        <button onClick={onBack} className="text-sm text-lol-gold hover:underline">
          ← All champions
        </button>
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-sm text-lol-text">
          No games recorded for {name} under the current filters.
        </div>
      </div>
    );
  }

  const kda = kdaRatio(champ.kills, champ.deaths, champ.assists);
  const avg = (n: number) => (champ.games > 0 ? n / champ.games : 0);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-lol-gold hover:underline">
        ← All champions
      </button>

      {/* Header */}
      <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <ChampionIcon championId={championId} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-lol-text-bright">{name}</h1>
              {tier && <TierBadge tier={tier} games={champ.games} />}
              <span className="text-sm text-lol-text-bright font-medium">
                {score(champ.wins, champ.games).toFixed(1)}
              </span>
            </div>
            <p className="text-xs text-lol-text mt-0.5">
              {champ.games} games · KDA {kda.toFixed(2)} ({avg(champ.kills).toFixed(1)} /{" "}
              {avg(champ.deaths).toFixed(1)} / {avg(champ.assists).toFixed(1)}) ·{" "}
              {formatCompact(avg(champ.damage))} dmg
              {champ.pentas > 0 ? ` · ${champ.pentas} penta${champ.pentas > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <div className="ml-auto w-44">
            <WinRateBar wins={champ.wins} total={champ.games} />
          </div>
        </div>
      </div>

      {/* Core build + best augments share the row on wide screens */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
          <h2 className="text-sm font-semibold text-lol-text-bright mb-3">Core build</h2>
          {coreBuild.length === 0 ? (
            <p className="text-sm text-lol-text">No item data yet.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {coreBuild.map((i) => {
                const wr = i.picks > 0 ? ((i.wins / i.picks) * 100).toFixed(0) : "0";
                return (
                  <div
                    key={i.item_id}
                    className="flex flex-col items-center w-16"
                    title={`${getItemTitle(itemData, i.item_id)} — ${i.picks} games`}
                  >
                    <ItemIcon itemData={itemData} itemId={i.item_id} size={48} />
                    <span className="text-xs text-lol-text-bright mt-1">
                      {wr}%{i.picks < 20 ? "*" : ""}
                    </span>
                    <span className="text-[10px] text-lol-text">{i.picks} games</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold text-lol-text-bright mb-3">Best augments</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            {augmentsByRarity.map((r) => (
              <div key={r.key}>
                <p className={`text-xs uppercase tracking-wider mb-2 ${r.color}`}>{r.label}</p>
                {r.best.length === 0 ? (
                  <p className="text-xs text-lol-text">No picks yet</p>
                ) : (
                  <div className="space-y-2">
                    {r.best.map((a) => (
                      <div key={a.augment_id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <AugmentIcon
                            augmentData={augmentData}
                            augmentId={a.augment_id}
                            size={24}
                            showName
                            wrap
                          />
                        </div>
                        <span className="text-xs text-lol-text w-8 text-right shrink-0">
                          {a.picks}x
                        </span>
                        <div className="w-24 shrink-0">
                          <WinRateBar wins={a.wins} total={a.picks} />
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

      {/* Full tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
          <h2 className="text-sm font-semibold text-lol-text-bright px-4 pt-4 pb-2">All items</h2>
          <table className="w-full">
            <thead className="bg-lol-dark/50">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-lol-text uppercase tracking-wider">
                  Item
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-lol-text uppercase tracking-wider">
                  Games
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-lol-text uppercase tracking-wider w-32">
                  Win Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.item_id} className="border-t border-lol-border/50">
                  <td className="px-3 py-1.5">
                    <ItemIcon itemData={itemData} itemId={i.item_id} size={24} showName />
                  </td>
                  <td className="px-3 py-1.5 text-sm text-lol-text-bright">{i.picks}</td>
                  <td className="px-3 py-1.5 w-32">
                    <WinRateBar wins={i.wins} total={i.picks} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="py-6 text-center text-sm text-lol-text">No item data</div>
          )}
        </div>

        <div className="bg-lol-card rounded-xl border border-lol-border/60 overflow-hidden">
          <h2 className="text-sm font-semibold text-lol-text-bright px-4 pt-4 pb-2">All augments</h2>
          <table className="w-full">
            <thead className="bg-lol-dark/50">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-lol-text uppercase tracking-wider">
                  Augment
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-lol-text uppercase tracking-wider">
                  Picks
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-lol-text uppercase tracking-wider w-32">
                  Win Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {augments.map((a) => (
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
                  <td className="px-3 py-1.5 text-sm text-lol-text-bright">{a.picks}</td>
                  <td className="px-3 py-1.5 w-32">
                    <WinRateBar wins={a.wins} total={a.picks} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {augments.length === 0 && (
            <div className="py-6 text-center text-sm text-lol-text">No augment data</div>
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
