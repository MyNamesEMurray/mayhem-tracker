import { comparePatches, formatPatch, type PatchSelection } from "../patch";

// The patch filter both surfaces use: current patch, every patch, or a span
// between two of them. It holds no state of its own — the site keeps its
// selection in the URL so a range can be linked to, the app keeps its own —
// so both hand in a selection and get one back.
//
// Patches arrive newest first, as availablePatches and getMatchFilterOptions
// both return them.
export default function PatchRangeSelect({
  patches,
  selection,
  onChange,
}: {
  patches: string[];
  selection: PatchSelection;
  onChange: (selection: PatchSelection) => void;
}) {
  const latest = patches[0] ?? "";
  const oldest = patches[patches.length - 1] ?? "";
  const isRange = selection.mode === "range";

  // A shared link, or a local database that has since dropped a patch, can
  // name an end that is not in this list. A dropdown whose value matches no
  // option renders blank, so show the nearest end that does exist — which is
  // also the end the filter itself resolves to.
  const shown = (patch: string, fallback: string) => (patches.includes(patch) ? patch : fallback);

  const setEnd = (from: string, to: string) => {
    // Choosing an end that crosses the other one is the ordinary way to build
    // a span in two dropdowns, so read it as the range the user drew rather
    // than as an empty one
    if (comparePatches(from, to) > 0) [from, to] = [to, from];
    onChange({ mode: "range", from, to });
  };

  const setMode = (mode: string) => {
    if (mode === "current") onChange({ mode: "current", from: latest, to: latest });
    else if (mode === "all")
      onChange({ mode: "all", from: patches[patches.length - 1] ?? "", to: latest });
    // A span of the last two patches is the useful thing to open on: it is
    // what someone reaches for when the current patch is thin, and it takes
    // one dropdown to widen from there.
    else onChange({ mode: "range", from: patches[1] ?? latest, to: latest });
  };

  // Three controls on one row is the whole trick. The mode dropdown shrinks to
  // "Range" once a range is live — its long label only matters while you are
  // choosing — which buys back the width for the two patch dropdowns to sit
  // beside it at phone widths rather than wrapping onto a row of their own.
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${isRange ? "max-[560px]:w-full" : ""}`}>
      <select
        className={`select ${isRange ? "select-sm select-flex" : "select-lg"}`}
        value={selection.mode}
        onChange={(e) => setMode(e.target.value)}
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
            value={shown(selection.from, oldest)}
            onChange={(e) => setEnd(e.target.value, selection.to)}
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
            value={shown(selection.to, latest)}
            onChange={(e) => setEnd(selection.from, e.target.value)}
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
