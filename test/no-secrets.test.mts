import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// A guard for a trap this repository walked into once.
//
// Seven migrations, the base schema among them, existed only inside the
// Supabase project. Recovering them is the obvious fix, and `supabase db pull`
// is the obvious way to do it. But one of them seeded a config table with live
// values inline: the secret that authorises approve and deny links on
// quarantined games, the cron secret, an API key, and a personal address. A
// pull writes those straight into the working tree, where the next `git add`
// publishes them.
//
// So: nothing that looks like a credential lands in this repository again.

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Directories that are ours to police. node_modules and build output are not.
const SEARCH = ["supabase", "scripts", ".github", "src", "website/src", "docs"];
const SKIP_DIRS = new Set(["node_modules", "dist", "out", ".ds-sync", ".cache"]);

// The anon key is a public client credential, published in the app and on the
// site by design. Everything else of that shape is not.
const PUBLISHED_ANON_KEY_PREFIX = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";

const PATTERNS: { name: string; re: RegExp }[] = [
  // 48 hex characters is what this project's review and cron secrets are
  { name: "48-character hex secrets", re: /\b[0-9a-f]{48}\b/ },
  { name: "service role keys", re: /service_role[^\n]{0,40}eyJ[A-Za-z0-9._-]{40,}/ },
  { name: "Resend API keys", re: /\bre_[A-Za-z0-9_]{20,}/ },
  { name: "AWS access key ids", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key blocks", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function filesUnder(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(filesUnder(full));
    else out.push(full);
  }
  return out;
}

const files = SEARCH.flatMap((d) => filesUnder(join(ROOT, d)));

describe("no credentials in the repository", () => {
  it("has files to check", () => {
    // A guard that silently checks nothing is worse than no guard
    assert.ok(files.length > 100, `expected to scan the repository, found ${files.length} files`);
  });

  for (const { name, re } of PATTERNS) {
    it(`contains no ${name}`, () => {
      const hits: string[] = [];
      for (const file of files) {
        let text: string;
        try {
          text = readFileSync(file, "utf8");
        } catch {
          continue;
        }
        for (const line of text.split("\n")) {
          // The anon key is meant to be here
          if (line.includes(PUBLISHED_ANON_KEY_PREFIX)) continue;
          if (re.test(line)) hits.push(`${file.slice(ROOT.length)}: ${line.trim().slice(0, 90)}`);
        }
      }
      assert.deepEqual(
        hits,
        [],
        `${name} found. If this is a real credential, rotate it and keep it out of git:\n${hits.join("\n")}`,
      );
    });
  }
});
