// Compare "2.10.0"-style versions numerically. Worth its own function because
// the obvious alternatives are both wrong: a lexicographic compare puts 2.9.3
// above 2.10.0, and the plain inequality the updater used before would offer
// an "update" to anyone running a build newer than the latest release.
// Returns <0 if a is older, 0 if equal, >0 if a is newer.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.trim().replace(/^v/i, "").split(".").map(Number);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    // Anything unparseable (a tag like "v2.1-beta") is treated as equal rather
    // than guessed at, so a malformed tag can never masquerade as an upgrade.
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
