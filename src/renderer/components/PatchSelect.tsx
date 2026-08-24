import { useState, useEffect } from "react";
import { formatPatch } from "../lib/format";

// `options` overrides the local patch list — the community source knows
// patches this install has never played, and without it the effect below
// would clear a perfectly valid selection for having no local games.
export default function PatchSelect({
  value,
  onChange,
  options,
}: {
  value: string | undefined;
  onChange: (patch: string | undefined) => void;
  options?: string[];
}) {
  const [localPatches, setLocalPatches] = useState<string[]>([]);
  const patches = options ?? localPatches;

  useEffect(() => {
    if (options) return;
    const fetchPatches = () =>
      window.api.getMatchFilterOptions().then((o) => setLocalPatches(o.patches));
    fetchPatches();
    const unsub = window.api.onGamesUpdated(fetchPatches);
    return unsub;
  }, [options]);

  // Clear the selection if new data leaves it without any matching games
  useEffect(() => {
    if (value !== undefined && patches.length > 0 && !patches.includes(value)) {
      onChange(undefined);
    }
  }, [patches, value, onChange]);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      className="select"
    >
      <option value="">All Patches</option>
      {patches.map((p) => (
        <option key={p} value={p}>
          Patch {formatPatch(p)}
        </option>
      ))}
    </select>
  );
}
