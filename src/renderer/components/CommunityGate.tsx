import { useEffect, useState, type ReactNode } from "react";
import Toggle from "./Toggle";

// The Global tab is give-to-get: it stays browsable, but the stats behind it
// only unlock while community sharing is on. Until then it shows the live
// community impact numbers (same aggregate views the website's Community
// page reads) and an inline opt-in toggle.

const SUPABASE_URL = "https://lmzenzxbhotszvwsnhlm.supabase.co";
// Public read-only client credential; raw tables sit behind RLS and only
// aggregate views are readable.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtemVuenhiaG90c3p2d3NuaGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjU0NDcsImV4cCI6MjEwMTgwMTQ0N30.7FoFD7LFaV5Yin4OnjYjECAYZPa2I9xc6oQa4xPAKpA";

interface CommunityTotals {
  games: number;
  contributors: number;
  total_seconds: number;
  patches: number;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-lol-card rounded-lg border border-lol-border/60 px-4 py-3">
      <div className="text-[10px] text-lol-text uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-lol-text-bright">{value}</div>
      {sub && <div className="text-[11px] text-lol-text">{sub}</div>}
    </div>
  );
}

export default function CommunityGate({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [totals, setTotals] = useState<CommunityTotals | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      window.api.getUploadStatus().then((s) => {
        if (alive) setEnabled(s.enabled);
      });
    refresh();
    const unsub = window.api.onUploadChanged(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (enabled !== false || totals) return;
    fetch(`${SUPABASE_URL}/rest/v1/community_totals?select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => setTotals(rows?.[0] ?? null))
      .catch(() => {
        // Offline: the gate still works, just without the live numbers
      });
  }, [enabled, totals]);

  if (enabled === null) return null;
  if (enabled) return <>{children}</>;

  const enable = async () => {
    setBusy(true);
    try {
      await window.api.setUploadEnabled(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[560px] mx-auto mt-12 text-center">
      <h1 className="text-xl font-bold text-lol-text-bright mb-2">
        Global stats are community-powered
      </h1>
      <p className="text-[13px] text-lol-text leading-relaxed mb-6">
        This tab aggregates every player from every contributed game — win rates, augments, and
        builds far beyond what one match history can show. It unlocks for players who add their own
        games to the pool.
      </p>

      {totals && (
        <div className="grid grid-cols-2 gap-3 mb-6 text-left">
          <Tile label="Contributors" value={String(totals.contributors)} />
          <Tile
            label="Games analyzed"
            value={totals.games.toLocaleString()}
            sub={`${(totals.games * 10).toLocaleString()} player performances`}
          />
          <Tile
            label="Gameplay hours"
            value={Math.round(totals.total_seconds / 3600).toLocaleString()}
          />
          <Tile label="Patches covered" value={String(totals.patches)} />
        </div>
      )}

      <div className="bg-lol-card rounded-lg border border-lol-border/60 px-4 py-3.5 flex items-center justify-between gap-4 text-left">
        <div>
          <div className="text-[13px] font-semibold text-lol-text-bright">
            Share match data with mayhemstats.com
          </div>
          <div className="text-xs text-lol-text mt-0.5">
            Only champions, augments, items, and combat stat lines are sent — nothing that
            identifies a player. Delete your contributions anytime from Settings.
          </div>
        </div>
        <Toggle checked={false} onChange={enable} disabled={busy} />
      </div>

      <button
        onClick={() => window.api.openUrl("https://mayhemstats.com/community/")}
        className="mt-4 text-xs text-lol-gold hover:underline cursor-pointer"
      >
        See the community impact on mayhemstats.com →
      </button>
    </div>
  );
}
