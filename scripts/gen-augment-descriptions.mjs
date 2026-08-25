// Regenerates the augment blurbs shown when you hover an augment icon, for
// both surfaces: src/shared/augment-descriptions.ts for the app and
// website/src/lib/augment-descriptions.ts for the site.
//
// Run it after a patch adds or reworks augments:
//
//   npm run gen:augments
//
// Why a generated file instead of a fetch at runtime: the augment list the app
// already loads (CommunityDragon's cherry-augments.json) carries names, icons
// and rarities but no description text at all. The only place that text exists
// is the game's own string table, and that file is ~33 MB — far too much to
// pull down on every launch for a hover tooltip. So the text is resolved once,
// here, and shipped as a small map keyed by augment id.
//
// Resolving is a name-matching job because the string table and the augment
// list don't share a key. An augment knows itself as `ARAM_SpeedDemon`; its
// text lives under keys like `kiwi_speeddemon_summary` (kiwi being the mode's
// internal codename), `cherry_speeddemon_summary` (the Arena wording of an
// augment that exists in both), or `augment_speeddemon_summary`. So candidates
// are generated from every prefix/suffix combination and tried in order of how
// specific they are, and the first one that cleans up into real prose wins.
import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The website deploys with its own directory as the project root, so it can't
// reach up into src/shared — it gets its own copy, the way it already keeps
// its own dragon.ts rather than importing the app's.
const OUTPUTS = [
  path.resolve(__dirname, "../src/shared/augment-descriptions.ts"),
  path.resolve(__dirname, "../website/src/lib/augment-descriptions.ts"),
];

const AUGMENTS_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json";
const STRINGS_URL =
  "https://raw.communitydragon.org/latest/game/en_us/data/menu/en_us/lol.stringtable.json";
const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;

async function fetchJson(url) {
  if (PROXY) {
    // Sandboxed/dev environments route HTTPS through a proxy that node's fetch
    // ignores; curl handles it
    const out = execFileSync("curl", ["-sS", "--max-time", "300", url], {
      maxBuffer: 256 * 1024 * 1024,
    });
    return JSON.parse(out.toString());
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Prefixes the string table files augment text under. `kiwi` is ARAM Mayhem's
// internal codename and `cherry` is Arena's; an augment that runs in both
// modes is usually written up once, under whichever mode shipped it first.
const PREFIXES = ["kiwi_", "kiwi_augment_", "cherry_", "augment_", ""];
// Suffixes in the order we want them: `summary` is the one-line blurb the
// game shows while picking, `tooltip` the fuller in-game text.
const SUFFIXES = ["_summary", "_tooltip", "_desc", "_description"];

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// A trailing "Damage Dealt: 1234" readout is a live in-game counter, not part
// of the description — with no game running it cleans up to a dangling label.
const COUNTER = /^[A-Z][A-Za-z '-]{2,34}:\s*\??$/;

// `{{Cherry_SoulSiphon_Summary}}` is the string table pointing at another of
// its own entries — often the whole description. Following it once or twice
// turns those into real text; anything still unresolved becomes a placeholder.
function resolveReferences(raw, entries, depth = 0) {
  if (depth > 2 || !raw.includes("{{")) return raw;
  return resolveReferences(
    raw.replace(/\{\{([^{}]*)\}\}/g, (whole, ref) => {
      const key = ref
        .replace(/@[^@]*@/g, "")
        .trim()
        .toLowerCase();
      const target = entries[key];
      return typeof target === "string" && target !== raw ? target : whole;
    }),
    entries,
    depth + 1,
  );
}

// Strips the game's inline markup down to plain text. Three things need
// handling beyond tags: `@Ratio*100@` placeholders, which the game fills from
// live spell data we don't have and which become "?"; cross-references that
// resolveReferences couldn't follow, which become the same; and `%i:icon%`
// sprite markers.
function toPlainText(raw, entries) {
  const segments = resolveReferences(raw, entries)
    .replace(/\{\{[^{}]*\}\}/g, "?")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/%i:[a-zA-Z]+%/g, "")
    .replace(/@[^@\n]{1,60}@/g, "?")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line && !COUNTER.test(line));

  return segments
    .join("\n")
    .replace(/ +([.,!%])/g, "$1")
    .trim();
}

// Real prose, rather than a leftover label or a single stripped placeholder
const isUsable = (text) => text.length >= 8 && /\s/.test(text);

function buildIndex(entries) {
  // body ("speeddemon") -> suffix ("_summary") -> text. Built once so an
  // augment can be looked up by its own id *or* by its display name, both
  // normalized, without scanning 138k keys per augment.
  const index = new Map();
  const nameToBodies = new Map();

  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== "string") continue;
    const suffix = SUFFIXES.find((s) => key.endsWith(s));
    const isName = key.endsWith("_name");
    if (!suffix && !isName) continue;

    const stem = key.slice(0, key.length - (suffix ? suffix.length : "_name".length));
    const prefix = PREFIXES.filter((p) => p && stem.startsWith(p)).sort(
      (a, b) => b.length - a.length,
    )[0];
    // Only the mode-data namespaces — otherwise an augment named after an item
    // ("Tempest's Gauntlet") matches that item's shop text instead.
    if (!prefix && !/^[a-z0-9_]+$/.test(stem)) continue;
    // The mode prefix is sometimes doubled up with the mode's own augment
    // naming ("kiwi_aram_goredrink"), so both spellings fold to one body.
    const body = normalize((prefix ? stem.slice(prefix.length) : stem).replace(/^aram_/, ""));
    if (!body) continue;

    if (isName) {
      const display = normalize(value);
      if (display) {
        if (!nameToBodies.has(display)) nameToBodies.set(display, new Set());
        nameToBodies.get(display).add(body);
      }
      continue;
    }
    let bySuffix = index.get(body);
    if (!bySuffix) index.set(body, (bySuffix = new Map()));
    // First prefix in PREFIXES order wins: mode-specific text over Arena's
    // over the generic wording.
    const rank = PREFIXES.indexOf(prefix ?? "");
    const existing = bySuffix.get(suffix);
    if (!existing || rank < existing.rank) bySuffix.set(suffix, { text: value, rank });
  }

  return { index, nameToBodies, entries };
}

function describe(augment, { index, nameToBodies, entries }) {
  const bodies = [];
  const push = (body) => {
    if (body && !bodies.includes(body)) bodies.push(body);
  };

  const id = (augment.augmentNameId || "").toLowerCase();
  push(normalize(id));
  push(normalize(id.replace(/^aram_/, "")));
  // Names last: an id match is the augment itself, a name match is only
  // something that happens to be called the same thing.
  for (const body of nameToBodies.get(normalize(augment.nameTRA || "")) || []) push(body);

  const candidates = [];
  for (const body of bodies) {
    const bySuffix = index.get(body);
    if (!bySuffix) continue;
    for (const suffix of SUFFIXES) {
      const entry = bySuffix.get(suffix);
      if (entry) candidates.push(toPlainText(entry.text, entries));
    }
  }

  const usable = candidates.filter(isUsable);
  // A wording with real numbers in it beats one that cleans up to "Gain ?%",
  // even when the placeholder-free one came from the Arena copy of the augment
  return usable.find((text) => !text.includes("?")) || usable[0] || null;
}

const [augments, strings, versions] = await Promise.all([
  fetchJson(AUGMENTS_URL),
  fetchJson(STRINGS_URL),
  fetchJson(VERSIONS_URL).catch(() => []),
]);

if (!Array.isArray(augments) || !augments.length) throw new Error("no augments in cherry-augments");
if (!strings?.entries) throw new Error("no entries in lol.stringtable");

const tables = buildIndex(strings.entries);
const described = [];
const undescribed = [];

const seen = new Set();

for (const augment of augments) {
  // A handful of entries are placeholders sharing id -1 (and Swarm's upgrade
  // list rides along in the same file); nothing in a match ever refers to them
  if (typeof augment?.id !== "number" || augment.id <= 0 || seen.has(augment.id)) continue;
  seen.add(augment.id);
  const text = describe(augment, tables);
  if (text) described.push([augment.id, augment.nameTRA || `Augment ${augment.id}`, text]);
  else undescribed.push(augment.nameTRA || augment.augmentNameId);
}

described.sort((a, b) => a[0] - b[0]);

const patch = String(versions[0] || "").match(/^\d+\.\d+/)?.[0] || "unknown";
const lines = described.map(
  ([id, name, text]) => `  // ${name}\n  ${id}: ${JSON.stringify(text)},`,
);

const contents = `// GENERATED FILE — do not edit by hand.
//
// Short augment descriptions, pulled out of the game's string table by
// scripts/gen-augment-descriptions.mjs and shipped with the app and the site so
// hovering an augment icon costs nothing at runtime. Regenerate after a patch
// changes the augment pool:
//
//   npm run gen:augments
//
// It writes both copies — src/shared/augment-descriptions.ts and
// website/src/lib/augment-descriptions.ts — so they can't drift apart.
//
// A "?" stands in for a number the game fills from live spell data the string
// table doesn't carry. Augments missing from this map — a handful have no
// description text anywhere in the string table — simply hover without one.
//
// Patch ${patch} · ${described.length} of ${described.length + undescribed.length} augments.
export const AUGMENT_DESCRIPTIONS: Record<number, string> = {
${lines.join("\n")}
};

// The Data Dragon patch the text above was generated from.
export const AUGMENT_DESCRIPTIONS_PATCH = ${JSON.stringify(patch)};
`;

for (const out of OUTPUTS) {
  writeFileSync(out, contents);
  // The repo's formatter owns quote style and line wrapping, so the generated
  // files land already formatted rather than showing up as a diff the next
  // time anyone runs `npm run format`
  try {
    execFileSync(path.resolve(__dirname, "../node_modules/.bin/oxfmt"), [out], { stdio: "ignore" });
  } catch {
    console.warn(
      "Could not run oxfmt on the generated files — run `npm run format` before committing",
    );
    break;
  }
}

console.log(
  `Wrote ${described.length} descriptions (patch ${patch}) to ${OUTPUTS.map((out) =>
    path.relative(process.cwd(), out),
  ).join(" and ")}`,
);
if (undescribed.length) {
  console.log(`No description text found for ${undescribed.length}: ${undescribed.join(", ")}`);
}
