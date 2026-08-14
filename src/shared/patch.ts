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
