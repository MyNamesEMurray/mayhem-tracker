import { comparePatches, formatPatch } from "../lib/stats";

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

  // Range mode shows three controls. Keeping them on one row is the whole
  // trick: the mode select shrinks to "Range" once a range is active (its
  // long label is only useful while you're choosing), which buys back enough
  // width for the two patch selects to sit beside it at phone widths instead
  // of wrapping onto a line of their own.
  const isRange = selection.mode === "range";

  return (
    <div
      className={`flex items-center gap-1.5 min-w-0 ${
        // Three controls don't fit beside the queue select on a phone, so the
        // picker claims its own row there and the selects share it
        isRange ? "max-[560px]:w-full" : ""
      }`}
    >
      <select
        className={`select ${isRange ? "select-sm select-flex" : "select-lg"}`}
        value={selection.mode}
        onChange={(e) => handleMode(e.target.value)}
        aria-label="Patch filter mode"
      >
        <option value="current">
          {latest ? `Current patch (${formatPatch(latest)})` : "Current patch"}
        </option>
        <option value="all">All patches</option>
        <option value="range">{isRange ? "Range" : "Patch range…"}</option>
      </select>
      {isRange && (
        <>
          <select
            className="select select-sm select-flex"
            value={selection.from}
            onChange={(e) => setRange(e.target.value, selection.to)}
            aria-label="Range start patch"
          >
            {patches.map((p) => (
              <option key={p} value={p}>
                {formatPatch(p)}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-lol-text shrink-0">to</span>
          <select
            className="select select-sm select-flex"
            value={selection.to}
            onChange={(e) => setRange(selection.from, e.target.value)}
            aria-label="Range end patch"
          >
            {patches.map((p) => (
              <option key={p} value={p}>
                {formatPatch(p)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
