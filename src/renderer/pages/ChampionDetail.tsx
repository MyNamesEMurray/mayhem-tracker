import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useUrlStatsFilters } from "../hooks/useStatsFilters";
import { useAugmentData, useChampionData, getAugmentName, getChampionName } from "../hooks/useChampions";
import type { AugmentStats, ChampionStats, ItemStats } from "../lib/types";
import { assignTiers, rankForBuild, score, MIN_SAMPLE, winRate } from "../lib/champStats";
import { formatAvg, formatWhole, kdaColor } from "../lib/format";
import type { StatsSource } from "../components/SourceSwitch";
import ChampionIcon from "../components/ChampionIcon";
import AugmentIcon from "../components/AugmentIcon";
import ItemIcon from "../components/ItemIcon";
import WinRateBar from "../components/WinRateBar";
import TierBadge from "../components/TierBadge";
import PatchSelect from "../components/PatchSelect";
import { useCommunityPatches } from "../hooks/useCommunityPatches";
import QueueSelect from "../components/QueueSelect";

const PANEL = "bg-lol-card rounded-xl border border-lol-border/60";
const LABEL = "text-[11px] font-medium uppercase tracking-[.08em] text-lol-text";

// Same floors the website and the prerendered pages use
const ITEM_MIN_GAMES = 3;
const AUGMENT_MIN_PICKS = 3;

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
  const source: StatsSource = searchParams.get("source") === "community" ? "community" : "mine";
  const { patch, setPatch, queue, setQueue } = useUrlStatsFilters();
  const communityPatches = useCommunityPatches(source);

  const champData = useChampionData();
  const augData = useAugmentData();
  const [champions, setChampions] = useState<ChampionStats[] | null>(null);
  const [augments, setAugments] = useState<AugmentStats[] | null>(null);
  const [items, setItems] = useState<ItemStats[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (source === "community") {
        const [all, detail] = await Promise.all([
          window.api.getCommunityChampionStats(patch, queue),
          window.api.getCommunityChampionDetail(championId, patch, queue),
        ]);
        if (!alive) return;
        setChampions(all);
        setAugments(detail.augments);
        setItems(detail.items);
        return;
      }
      const [all, augs, its] = await Promise.all([
        window.api.getChampionStats(patch, queue),
        window.api.getAugmentStats(championId, patch, queue),
        window.api.getChampionItemStats(championId, patch, queue),
      ]);
      if (!alive) return;
      setChampions(all);
      setAugments(augs);
      setItems(its);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [championId, patch, queue, source]);

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

  const coreBuild = useMemo(
    () => rankForBuild(items ?? [], (i) => i.picks, (i) => i.wins, ITEM_MIN_GAMES, 6),
    [items],
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
              {formatAvg(perGame(champ.assists))})
              {source === "community" && " · community games"}
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
                  <div key={i.item_id} className="flex flex-col items-center w-[52px]">
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
                        <span className="text-[11px] text-lol-text ml-auto shrink-0">
                          {winRate(a.wins, a.picks).toFixed(0)}%
                          {a.picks < MIN_SAMPLE ? "*" : ""}
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
          rows={items.map((i) => ({
            key: i.item_id,
            icon: <ItemIcon itemId={i.item_id} size={24} patch={patch} />,
            name: null,
            picks: i.picks,
            wins: i.wins,
          }))}
        />
        <StatTable
          title="All augments"
          rows={augments.map((a) => ({
            key: a.augment_id,
            icon: <AugmentIcon augmentId={a.augment_id} size={24} />,
            name: getAugmentName(augData, a.augment_id),
            picks: a.picks,
            wins: a.wins,
          }))}
        />
      </div>

      <p className="text-[11px] text-lol-text">
        Entries marked * fall under {MIN_SAMPLE} games. Score blends the win rate with a 50% prior
        worth 20 games, so a confident record outranks a lucky one — the same method as
        mayhemstats.com.
      </p>
    </div>
  );
}

function StatTable({
  title,
  rows,
}: {
  title: string;
  rows: { key: number; icon: React.ReactNode; name: string | null; picks: number; wins: number }[];
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...rows].sort((a, b) => b.picks - a.picks);
  const visible = showAll ? sorted : sorted.slice(0, 10);

  return (
    <div className={`${PANEL} p-5`}>
      <h2 className={`${LABEL} mb-3`}>{title}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-lol-text">No data yet.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map((r) => (
              <div key={r.key} className="flex items-center gap-2.5 h-7">
                <span className="shrink-0 leading-none">{r.icon}</span>
                {r.name && (
                  <span className="text-xs text-lol-text-bright truncate min-w-0">{r.name}</span>
                )}
                <span className="text-[11px] text-lol-text ml-auto shrink-0">{r.picks}x</span>
                <span className="shrink-0">
                  <WinRateBar wins={r.wins} total={r.picks} />
                </span>
              </div>
            ))}
          </div>
          {sorted.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs text-lol-gold hover:text-lol-gold-light cursor-pointer"
            >
              {showAll ? "Show top 10" : `Show all ${sorted.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
