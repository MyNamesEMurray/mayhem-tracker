import { useState, useEffect } from "react";

export default function PatchSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (patch: string | undefined) => void;
}) {
  const [patches, setPatches] = useState<string[]>([]);

  useEffect(() => {
    const fetchPatches = () =>
      window.api.getMatchFilterOptions().then((o) => setPatches(o.patches));
    fetchPatches();
    const unsub = window.api.onGamesUpdated(fetchPatches);
    return unsub;
  }, []);

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
          Patch {p}
        </option>
      ))}
    </select>
  );
}
