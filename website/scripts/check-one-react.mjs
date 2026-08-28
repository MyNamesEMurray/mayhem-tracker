// Fails the build if the site bundled more than one copy of React.
//
// The shared components in ../src/shared/ui live outside this project, so they
// resolve react from the repository root's node_modules while everything under
// src/ resolves it from website/node_modules. vite.config.ts pins both to one
// copy with resolve.dedupe; without it the bundle carries two React instances,
// the second of which has its own hook dispatcher - the shared useTooltip
// would register against the wrong one and its hooks would misbehave at
// runtime, with nothing failing at build time to say so.
//
// React embeds its version string, so two installs at different versions show
// up as two versions in one bundle. That is what this checks. It cannot see a
// duplicate when both installs happen to be at the same version - dedupe is
// what prevents the bug; this is the backstop that noticed it once already.

import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const versionAt = (dir) => {
  try {
    return JSON.parse(readFileSync(path.join(dir, "node_modules/react/package.json"), "utf8"))
      .version;
  } catch {
    return null;
  }
};

const site = versionAt(root);
const repo = versionAt(path.resolve(root, ".."));

if (!site || !repo || site === repo) {
  const why = !site || !repo ? "only one react install found" : `both installs are ${site}`;
  console.log(`check-one-react: skipped (${why})`);
  process.exit(0);
}

const assets = path.join(root, "dist/assets");
const bundles = readdirSync(assets).filter((f) => f.endsWith(".js"));
const found = new Set();
for (const file of bundles) {
  const source = readFileSync(path.join(assets, file), "utf8");
  for (const v of [site, repo]) if (source.includes(v)) found.add(v);
}

if (found.has(site) && found.has(repo)) {
  console.error(
    `check-one-react: the bundle carries React ${site} (website/node_modules) and ` +
      `${repo} (repository root). Two React instances means two hook dispatchers. ` +
      `Check resolve.dedupe in vite.config.ts.`,
  );
  process.exit(1);
}

console.log(`check-one-react: one React (${[...found].join(", ") || site})`);
