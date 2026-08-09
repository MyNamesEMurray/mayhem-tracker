// Read-only access to the community stats project. The key is the project's
// public client credential: raw tables are locked behind row level security,
// and these aggregate views are the only readable surface.
const SUPABASE_URL = "https://lmzenzxbhotszvwsnhlm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtemVuenhiaG90c3p2d3NuaGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjU0NDcsImV4cCI6MjEwMTgwMTQ0N30.7FoFD7LFaV5Yin4OnjYjECAYZPa2I9xc6oQa4xPAKpA";

export interface ChampionStatRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  games: number;
  wins: number;
}

export interface AugmentStatRow {
  patch: string;
  queue_id: number;
  augment_id: number;
  champion_id: number;
  picks: number;
  wins: number;
}

// PostgREST caps responses at 1000 rows, so page with Range headers until a
// short page arrives.
async function fetchAll<T>(view: string): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to load ${view} (HTTP ${res.status})`);
    }
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export function fetchChampionStats(): Promise<ChampionStatRow[]> {
  return fetchAll<ChampionStatRow>("champion_stats");
}

export function fetchAugmentStats(): Promise<AugmentStatRow[]> {
  return fetchAll<AugmentStatRow>("augment_stats");
}
