// The patch clause for a local-database query, kept out of db.ts so it can be
// tested: db.ts pulls in electron and a native sqlite binding built for
// Electron's runtime, neither of which loads under plain node.

// Undefined means every patch, so no clause at all. An empty list means a
// selection that covers nothing - a range entirely outside the games this
// install holds - and has to produce no rows rather than every row, which is
// what leaving the clause off would do.
export function applyPatchFilter(
  where: string[],
  params: unknown[],
  patches?: string[],
  alias = "g",
) {
  if (patches == null) return;
  if (patches.length === 0) {
    where.push("0 = 1");
    return;
  }
  where.push(`${alias}.game_version IN (${patches.map(() => "?").join(", ")})`);
  params.push(...patches);
}
