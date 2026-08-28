import { useEffect, useMemo, useState } from "react";
import { itemIconSources } from "../cdn";

// An item's artwork, and its name when asked for.
//
// The caller resolves the item - which mapping to look it up in differs by
// surface, since the app wants the CommunityDragon branch matching the patch a
// game was played on and the site only ever needs the latest - and hands over
// what it found. Everything after that is shared: which URLs are worth trying,
// walking them on error, the size, the rim, and the placeholder that holds its
// space when nothing loads.
export default function ItemIcon({
  itemId,
  iconPath,
  branch,
  name,
  size = 24,
  showName = false,
  wrap = false,
}: {
  itemId: number;
  // From the item mapping. Absent - an unknown id, or a mapping still loading
  // - falls straight through to the legacy mirror and then the placeholder.
  iconPath?: string;
  // The CommunityDragon branch the path came from. Defaults to "latest".
  branch?: string;
  name?: string;
  size?: number;
  showName?: boolean;
  // Let a long name run onto a second line rather than be cut off. Table rows
  // grow a little; "Overlord's Bloodmail" stays readable on a phone.
  wrap?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const sources = useMemo(
    () => (itemId ? itemIconSources(itemId, iconPath, branch) : []),
    [itemId, iconPath, branch],
  );
  const key = sources.join("|");

  // A different item (or a newly loaded mapping) starts the walk again
  useEffect(() => {
    setAttempt(0);
  }, [key]);

  const src = sources[attempt];

  const art = src ? (
    <img
      key={src}
      src={src}
      alt=""
      title={showName ? undefined : name}
      width={size}
      height={size}
      loading="lazy"
      className="rounded shrink-0 ring-1 ring-lol-border"
      onError={() => setAttempt((a) => a + 1)}
    />
  ) : (
    // Holds its space, so a row of item slots keeps its shape when one is
    // empty or every URL has failed
    <span
      className="rounded shrink-0 ring-1 ring-lol-border bg-lol-dark inline-block"
      title={showName ? undefined : name}
      style={{ width: size, height: size }}
    />
  );

  // Without a name there is nothing to lay out beside the art, and the dense
  // item strips on both surfaces put these straight into their own grid.
  if (!showName) return art;

  return (
    <div className="flex items-center gap-1.5 min-w-0" title={name}>
      {art}
      <span className={`text-sm text-lol-text-bright ${wrap ? "leading-snug" : "truncate"}`}>
        {name}
      </span>
    </div>
  );
}
