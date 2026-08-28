import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { applyPatchFilter } from "../src/main/patch-filter.ts";
import { parsePatchParam, patchesIn } from "../src/shared/patch.ts";

// The clause is only meaningful against a database, so these run it against
// one. node:sqlite rather than the app's better-sqlite3, which is built for
// Electron's runtime and won't load here.
const PATCHES = ["26.2", "26.1", "25.24", "25.23", "25.9"];

function versionsMatching(patches: string[] | undefined): string[] {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE g (game_version TEXT)");
  const insert = db.prepare("INSERT INTO g VALUES (?)");
  for (const p of PATCHES) insert.run(p);

  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];
  applyPatchFilter(where, params, patches);
  const rows = db
    .prepare(`SELECT game_version FROM g WHERE ${where.join(" AND ")}`)
    .all(...(params as string[])) as { game_version: string }[];
  db.close();
  return rows.map((r) => r.game_version);
}

describe("applyPatchFilter", () => {
  it("selects every row when there is no patch filter", () => {
    assert.deepEqual(versionsMatching(undefined), PATCHES);
  });

  it("selects one patch", () => {
    assert.deepEqual(versionsMatching(["26.1"]), ["26.1"]);
  });

  it("selects a span, binding one parameter per patch", () => {
    assert.deepEqual(versionsMatching(["26.1", "25.24", "25.23"]), ["26.1", "25.24", "25.23"]);
  });

  it("selects nothing for an empty list", () => {
    // The clause has to be written rather than left off: a range that covers
    // no patch this install has played means no games, and leaving the WHERE
    // clause out would silently return every game instead.
    assert.deepEqual(versionsMatching([]), []);
  });

  it("ignores a patch the database has never seen", () => {
    assert.deepEqual(versionsMatching(["26.1", "99.9"]), ["26.1"]);
  });

  it("takes patch names as values, not as SQL", () => {
    // Patch names come from a URL parameter on the champion page, so they
    // reach this clause as whatever was in the link
    assert.deepEqual(versionsMatching(["26.1'); DROP TABLE g; --"]), []);
    assert.deepEqual(versionsMatching(["26.1"]), ["26.1"], "the table is still there");
  });

  it("matches what the picker says a selection covers", () => {
    // The two halves of the filter agree: what the range picker resolves to,
    // and what the query then selects
    const covered = patchesIn(parsePatchParam("25.23-26.1", PATCHES), PATCHES);
    assert.deepEqual(versionsMatching(covered), ["26.1", "25.24", "25.23"]);
  });
});
