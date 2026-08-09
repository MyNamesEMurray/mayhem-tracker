import { comparePatches } from "../lib/stats";

// Patch filter with three modes, encoded in the ?patch= param:
//   absent  -> current patch only (the default view)
//   "all"   -> every patch
//   "X.Y"   -> that single patch (kept for old shared links)
//   "A-B"   -> inclusive range
export interface PatchSelection {
  mode: "current" | "all" | "range";
  from: string;
  to: string;
}

export function parsePatchParam(param: string | null, patches: string[]): PatchSelection {
  const latest = patches[0] ?? "";
  const oldest = patches[patches.length - 1] ?? "";
  if (!param) return { mode: "current", from: latest, to: latest };
  if (param === "all") return { mode: "all", from: oldest, to: latest };
  const [a, b] = param.split("-");
  return { mode: "range", from: a, to: b || a };
}

// The set of patches a selection includes; undefined means no filter
export function selectionPatchSet(
  selection: PatchSelection,
  patches: string[],
): Set<string> | undefined {
  if (selection.mode === "all" || patches.length === 0) return undefined;
  if (selection.mode === "current") return new Set(patches.slice(0, 1));
  return new Set(
    patches.filter(
      (p) => comparePatches(p, selection.from) >= 0 && comparePatches(p, selection.to) <= 0,
    ),
  );
}

export default function PatchRangeSelect({
  patches,
  param,
  onChange,
}: {
  patches: string[];
  param: string | null;
  onChange: (value: string | null) => void;
}) {
  const selection = parsePatchParam(param, patches);
  const latest = patches[0];

  const setRange = (from: string, to: string) => {
    if (comparePatches(from, to) > 0) [from, to] = [to, from];
    if (from === to) {
      onChange(to === latest ? null : from);
    } else {
      onChange(`${from}-${to}`);
    }
  };

  const handleMode = (mode: string) => {
    if (mode === "current") onChange(null);
    else if (mode === "all") onChange("all");
    else {
      // A sensible starter range: previous patch through current
      const from = patches[1] ?? latest;
      onChange(`${from}-${latest}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select className="select" value={selection.mode} onChange={(e) => handleMode(e.target.value)}>
        <option value="current">{latest ? `Current patch (${latest})` : "Current patch"}</option>
        <option value="all">All patches</option>
        <option value="range">Patch range…</option>
      </select>
      {selection.mode === "range" && (
        <>
          <select
            className="select"
            value={selection.from}
            onChange={(e) => setRange(e.target.value, selection.to)}
          >
            {patches.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="text-xs text-lol-text">to</span>
          <select
            className="select"
            value={selection.to}
            onChange={(e) => setRange(selection.from, e.target.value)}
          >
            {patches.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
