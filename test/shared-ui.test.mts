// A guard for a trap this codebase fell into three times.
//
// Tailwind scans source files as plain text, comments included, so an ordinary
// English word that happens to be a utility name mints a real CSS rule in both
// bundles. Writing "the ring around an icon", "the outline around an icon" and
// "the site used to inline its own copy" in three shared-component comments
// shipped .ring, .outline and .inline to the app and the site.
//
// The list below is deliberately short: utilities that are also plain words a
// comment might reach for, and which have a natural synonym. Words with no
// good alternative in technical prose — border, flex, grid, table — are left
// out on purpose, because a guard that cries wolf gets deleted.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname: on Windows a file:// URL's pathname is
// "/D:/a/..." with a leading slash, and joining that against the working
// directory produces "D:\D:\a\..." — which is how this first ran on a Windows
// runner, and only there, since the app is built on one but tested on Linux.
const SHARED_UI = fileURLToPath(new URL("../src/shared/ui/", import.meta.url));
const THEME = fileURLToPath(new URL("../src/shared/theme.css", import.meta.url));

const AVOID = [
  "ring",
  "outline",
  "inline",
  "truncate",
  "isolate",
  "resize",
  "sticky",
  "invisible",
  "capitalize",
];

const SUGGEST: Record<string, string> = {
  ring: "rim, halo, edge",
  outline: "rim, edge",
  inline: "written here, written by hand, in place",
  truncate: "cut off, clipped",
  isolate: "separate",
  resize: "resizing",
  sticky: "pinned",
  invisible: "hidden from view",
  capitalize: "title-cased",
};

// Every comment in a file, code stripped out
function comments(source: string): string {
  const blocks = source.match(/\/\*[\s\S]*?\*\//g) ?? [];
  const lines = source.match(/(^|[^:])\/\/[^\n]*/g) ?? [];
  return [...blocks, ...lines].join("\n");
}

function sharedFiles(): string[] {
  const files = readdirSync(SHARED_UI)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => path.join(SHARED_UI, f));
  return [...files, THEME];
}

describe("shared component comments do not mint CSS rules", () => {
  for (const file of sharedFiles()) {
    test(path.basename(file), () => {
      const prose = comments(readFileSync(file, "utf8"));
      const found = AVOID.filter((w) => new RegExp(`(^|[^a-zA-Z-])${w}([^a-zA-Z-]|$)`).test(prose));
      assert.deepEqual(
        found,
        [],
        found.length
          ? `${path.basename(file)}: a comment uses ${found
              .map((w) => `"${w}" (try ${SUGGEST[w]})`)
              .join(", ")} — Tailwind reads comments, so this ships a real rule`
          : "",
      );
    });
  }

  test("the guard can actually fail", () => {
    const prose = comments("// the ring around an icon\n");
    assert.ok(AVOID.some((w) => new RegExp(`(^|[^a-zA-Z-])${w}([^a-zA-Z-]|$)`).test(prose)));
  });

  test("and does not fire on a class name in code", () => {
    const prose = comments('const x = "ring-1 ring-gray-400/60";\n');
    assert.equal(prose, "", "no comment in that source, so nothing to check");
  });
});
