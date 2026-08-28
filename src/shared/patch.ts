// Riot's data APIs kept sequential client versions ("16.16") when patch
// names went year-based in 2025 ("26.16"). We store and display year-based
// names everywhere; CDN lookups (DDragon/CommunityDragon) still use client
// versions. Client majors stay below 25 until 2035, so the ranges cannot
// collide and both conversions are idempotent.

export function toYearPatch(patch: string): string {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${m[2]}` : patch;
}

export function toClientPatch(patch: string): string {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 25 ? `${major - 10}.${m[2]}` : patch;
}

// How a patch is written wherever one is shown. Community rows have been
// stored year-based since the database was normalised, so this is a safety net
// for a stray client-style value rather than a routine conversion — and
// toYearPatch is idempotent, so applying it twice costs nothing.
export function formatPatch(patch: string): string {
  return toYearPatch(patch);
}

// Patch ordering, for range filters and "newest first" lists. Both fields are
// numeric in every patch name the database holds.
export function comparePatches(a: string, b: string): number {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

// A patch filter, shared by the app and the site so the two mean the same
// thing by "current patch" and encode a range into a link the same way.
//
//   current -> the newest patch with data, the default view on both surfaces
//   all     -> no patch filter at all
//   range   -> every patch from `from` through `to`, inclusive
//
// A single patch is a range whose ends are equal, rather than a fourth mode:
// the picker that widens one patch into a span shouldn't have to change mode
// to do it, and an old link holding one patch keeps working.
export interface PatchSelection {
  mode: "current" | "all" | "range";
  from: string;
  to: string;
}

// Both surfaces put the selection in a ?patch= parameter, so a range survives
// a page reload and can be linked to. The grammar:
//
//   absent  -> current patch
//   "all"   -> every patch
//   "X.Y"   -> that single patch
//   "A-B"   -> inclusive range
//
// `patches` is newest-first, as availablePatches and getMatchFilterOptions
// both return it.
export function parsePatchParam(
  param: string | null | undefined,
  patches: string[],
): PatchSelection {
  const latest = patches[0] ?? "";
  const oldest = patches[patches.length - 1] ?? "";
  if (!param) return { mode: "current", from: latest, to: latest };
  if (param === "all") return { mode: "all", from: oldest, to: latest };
  const [a, b] = param.split("-");
  return { mode: "range", from: a, to: b || a };
}

// The inverse. Null means "leave the parameter off", which reads as the
// default — so a link to the current patch stays a bare URL.
export function patchParam(selection: PatchSelection, patches: string[]): string | null {
  const latest = patches[0] ?? "";
  if (selection.mode === "current") return null;
  if (selection.mode === "all") return "all";
  let { from, to } = selection;
  if (comparePatches(from, to) > 0) [from, to] = [to, from];
  if (from === to) return to === latest ? null : from;
  return `${from}-${to}`;
}

// The patches a selection covers. Undefined means no filtering — every patch
// — which is what both the in-memory community filter and the database query
// take as "leave this out of the WHERE clause".
export function patchesIn(selection: PatchSelection, patches: string[]): string[] | undefined {
  if (selection.mode === "all" || patches.length === 0) return undefined;
  if (selection.mode === "current") return patches.slice(0, 1);
  const [lo, hi] =
    comparePatches(selection.from, selection.to) <= 0
      ? [selection.from, selection.to]
      : [selection.to, selection.from];
  return patches.filter((p) => comparePatches(p, lo) >= 0 && comparePatches(p, hi) <= 0);
}

// How a selection reads in a page title: "Patch 26.2", "Patches 25.24–26.2",
// "All patches". Empty when there are no patches at all, since "Patch " with
// nothing after it is worse than saying nothing.
//
// The dash between two patches is an en dash, which is what a span of values
// takes; the hyphen in the URL parameter is a separator and stays a hyphen.
export function patchLabel(selection: PatchSelection, patches: string[]): string {
  // A fresh install with no games has nothing to name, and "All patches" over
  // zero games reads as a filter that found nothing rather than as no data
  if (patches.length === 0) return "";
  const included = patchesIn(selection, patches);
  if (included == null) return "All patches";
  if (included.length === 0) return "No patches";
  if (included.length === 1) return `Patch ${formatPatch(included[0])}`;
  const newest = formatPatch(included[0]);
  const oldest = formatPatch(included[included.length - 1]);
  return `Patches ${oldest}\u2013${newest}`;
}

// A range spanning two patches, ordered however they arrive
export function patchRange(from: string, to: string): PatchSelection {
  return { mode: "range", from, to };
}
