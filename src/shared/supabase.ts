// How both surfaces read the community stats project.
//
// The connection details and the paging loop were written out separately in
// website/src/lib/api.ts and src/main/community.ts, and the loop in particular
// was the same forty lines twice, down to the comment explaining why the pages
// have to be ordered. Same story as the scoring maths and the patch picker
// before it.

// The project's public client credential. Safe to ship: every raw table has
// row level security on with no policies, so anon can read none of them. The
// only readable surface is the aggregate views, and the only writer is the
// ingest function running as the service role.
export const SUPABASE_URL = "https://lmzenzxbhotszvwsnhlm.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtemVuenhiaG90c3p2d3NuaGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjU0NDcsImV4cCI6MjEwMTgwMTQ0N30.7FoFD7LFaV5Yin4OnjYjECAYZPa2I9xc6oQa4xPAKpA";

// PostgREST caps a response at 1000 rows whatever Range asks for, so a bigger
// page does not fetch more, it just makes the walk stop after the first page
// and silently truncate the view. Pages stay at 1000 and the first request
// asks for an exact count instead, which lets the rest go out together rather
// than one after another.
const PAGE = 1000;

async function fetchPage<T>(
  view: string,
  query: string,
  from: number,
  withCount: boolean,
): Promise<{ rows: T[]; total: number | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Range: `${from}-${from + PAGE - 1}`,
      ...(withCount ? { Prefer: "count=exact" } : {}),
    },
  });
  if (!res.ok) throw new Error(`Failed to load ${view} (HTTP ${res.status})`);
  const rows = (await res.json()) as T[];
  // "0-999/3562" - the total is what lets the remaining pages be parallel
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  return { rows, total: Number.isFinite(total) ? total : null };
}

// Every page is its own query and the pages after the first go out together,
// so a view that hands rows back in whatever order it likes can repeat one
// page's rows in another and drop the difference. Each caller's query must
// name an order over a unique key of the view, which the rollups are indexed
// on.
export async function fetchAllRows<T>(view: string, query = "select=*"): Promise<T[]> {
  const first = await fetchPage<T>(view, query, 0, true);
  if (first.rows.length < PAGE) return first.rows;

  if (first.total == null) {
    // No count header: walk pages until one comes up short
    const out = [...first.rows];
    for (let from = PAGE; ; from += PAGE) {
      const page = await fetchPage<T>(view, query, from, false);
      out.push(...page.rows);
      if (page.rows.length < PAGE) return out;
    }
  }

  const offsets: number[] = [];
  for (let from = PAGE; from < first.total; from += PAGE) offsets.push(from);
  const rest = await Promise.all(offsets.map((from) => fetchPage<T>(view, query, from, false)));
  return [...first.rows, ...rest.flatMap((p) => p.rows)];
}

// A PostgREST filter naming an exact set of patches, or "" for no filter.
//
// This is the difference between a visit costing 12 KB and costing 237 KB.
// Both surfaces used to pull every patch ever recorded to render the current
// one, and the payload grew by about 11 KB with every patch released, forever,
// whether or not anyone looked at the older ones.
//
// Patch names are `\d+\.\d+` by construction (the ingest function validates
// against that, and the picker only ever offers values that came back from the
// database), but they are still concatenated into a URL here, so anything that
// is not two groups of digits is dropped rather than sent.
const PATCH_RE = /^\d{1,4}\.\d{1,4}$/;

export function patchFilter(patches?: string[]): string {
  if (patches == null) return "";
  const safe = patches.filter((p) => PATCH_RE.test(p));
  if (safe.length === 0) {
    // An empty set means "no patches", which has to select nothing rather
    // than everything. PostgREST reads in.() as an empty list and matches no
    // rows, which is the answer we want.
    return "&patch=in.()";
  }
  return `&patch=in.(${safe.join(",")})`;
}
