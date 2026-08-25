import { useEffect, useState } from "react";

// An item's artwork, and its name when asked for.
//
// Presentational on purpose: the caller resolves which URLs are worth trying
// and what the item is called, because that differs by surface. The app looks
// items up on the CommunityDragon branch matching the patch a game was played
// on and falls back twice; the site only ever needs the latest. What is shared
// is the drawing — the size, the rim, the placeholder that holds its space
// when nothing loads, and walking the candidate URLs on error.
export default function ItemIcon({
  sources,
  name,
  size = 24,
  showName = false,
  wrap = false,
}: {
  // Candidate URLs, best first. Empty renders the placeholder.
  sources: string[];
  name?: string;
  size?: number;
  showName?: boolean;
  // Let a long name run onto a second line rather than be cut off. Table rows
  // grow a little; "Overlord's Bloodmail" stays readable on a phone.
  wrap?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
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
