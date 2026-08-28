// Post-build prerender: generates a static HTML page per champion at
// dist/champion/<slug>/index.html plus a sitemap covering them, from the
// live community data. Each page carries real content (title, description,
// build summary) for crawlers and no-JS visitors; the interactive app boots
// on top and replaces it for everyone else.
//
// Two rules keep these pages from reading as auto-generated filler:
//   * a champion is only indexed (robots + sitemap) once its sample is big
//     enough to say something - below that the page still exists and still
//     works, it just tells the truth and stays out of search;
//   * no line is printed from a sample too small to mean anything, so the
//     page never claims "100% win rate over 1 pick".
//
// Deliberately fails soft: if the data APIs are unreachable at build time,
// the site still deploys as a plain SPA.
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "../dist");
const SITE = "https://mayhemstats.com";

const SUPABASE_URL = "https://lmzenzxbhotszvwsnhlm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtemVuenhiaG90c3p2d3NuaGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjU0NDcsImV4cCI6MjEwMTgwMTQ0N30.7FoFD7LFaV5Yin4OnjYjECAYZPa2I9xc6oQa4xPAKpA";

// A champion page is only worth putting in front of search users once the
// win rate on it carries a readable confidence interval. Twenty games is
// the same floor the app uses to stop muting win rates (src/lib/stats.ts).
const INDEX_MIN_GAMES = 20;
// Nothing gets printed as a recommendation from fewer picks than this.
const ITEM_MIN_PICKS = 3;
const AUGMENT_MIN_PICKS = 3;

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;

async function fetchJson(url, headers = {}) {
  if (PROXY) {
    // Sandboxed/dev environments route HTTPS through a proxy that node's
    // fetch ignores; curl handles it
    const args = ["-sS", "--max-time", "60", url];
    for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
    return JSON.parse(execFileSync("curl", args, { maxBuffer: 128 * 1024 * 1024 }).toString());
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// PostgREST caps a page at 1000 rows and the per-champion grains run to a few
// hundred thousand, so pages go out in batches rather than one at a time. A
// batch stops the walk as soon as one of its pages comes up short.
//
// Batched pages are separate queries, so the view has to hand rows back in a
// fixed order or one page repeats another's rows and the difference is lost:
// `order` names a unique key of the view, which the rollups are indexed on.
const PAGE_BATCH = 8;

function fetchPageRows(view, order, from) {
  return fetchJson(`${SUPABASE_URL}/rest/v1/${view}?select=*&order=${order}`, {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Range: `${from}-${from + 999}`,
  });
}

async function fetchAllRows(view, order) {
  const out = [];
  for (let from = 0; ; from += 1000 * PAGE_BATCH) {
    const offsets = Array.from({ length: PAGE_BATCH }, (_, i) => from + i * 1000);
    const pages = await Promise.all(offsets.map((offset) => fetchPageRows(view, order, offset)));
    let done = false;
    for (const rows of pages) {
      out.push(...rows);
      if (rows.length < 1000) done = true;
    }
    if (done) return out;
  }
}

// Mirrors src/lib/slug.ts - keep in sync
const championSlug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Mirrors src/lib/stats.ts score(): the win rate a record supports, out of
// 100 - the floor of a 95% Wilson interval. Everything ranks by it, so a 5-0
// item lands below a 60% one with hundreds of games.
const score = (wins, games) => {
  if (games <= 0) return 0;
  const p = wins / games;
  const z = 1.96;
  const z2 = z * z;
  const centre = p + z2 / (2 * games);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * games)) / games);
  return (100 * (centre - margin)) / (1 + z2 / games);
};

// Mirrors src/lib/stats.ts formatPatch(): stored patches are year-based
// ("26.16"); shifting stray client-style values ("16.16") is idempotent
const formatPatch = (patch) => {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${m[2]}` : patch;
};

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const pct = (wins, n) => (n > 0 ? ((wins / n) * 100).toFixed(1) : "0.0");
const num = (n) => Math.round(n).toLocaleString();
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Half-width of the 95% normal-approximation interval on a win rate, in
// points. Printed so a reader can see how much of a number is noise.
const marginOfError = (wins, games) => {
  const p = wins / games;
  return 100 * 1.96 * Math.sqrt((p * (1 - p)) / games);
};

// "18% above" / "in line with" / "12% below", for comparing a champion's
// per-game averages against the whole database
function relative(value, base) {
  if (!base) return "in line with the mode average";
  const diff = ((value - base) / base) * 100;
  if (Math.abs(diff) < 8) return "in line with the mode average";
  return `${Math.round(Math.abs(diff))}% ${diff > 0 ? "above" : "below"} the mode average`;
}

// Mirrors src/lib/stats.ts rankForBuild: a workable sample AND a record that
// isn't losing, ranked by confidence score. An item that has never won is not a
// recommendation, however many times it was built.
function rankForBuild(list, minPicks, count) {
  return list
    .filter((x) => x.picks >= minPicks && x.wins * 2 >= x.picks)
    .sort((a, b) => score(b.wins, b.picks) - score(a.wins, a.picks))
    .slice(0, count);
}

function aggregate(rows, keyField, extra = []) {
  const map = new Map();
  for (const r of rows) {
    let e = map.get(r[keyField]);
    if (!e) {
      e = { key: r[keyField], picks: 0, wins: 0 };
      for (const f of extra) e[f] = 0;
      map.set(r[keyField], e);
    }
    e.picks += r.picks ?? r.games;
    e.wins += r.wins;
    for (const f of extra) e[f] += r[f] ?? 0;
  }
  return Array.from(map.values());
}

// Colours come from the built stylesheet's :root tokens, which every
// prerendered page links before any JavaScript runs.
const PAGE_STYLE = `      #prerender { max-width: 780px; margin: 0 auto; padding: 2rem 1.25rem 3rem; color: var(--color-lol-text);
        font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif; line-height: 1.6; }
      #prerender h1, #prerender h2, #prerender h3 { color: var(--color-lol-text-bright); }
      #prerender h1 { font-size: 1.5rem; } #prerender h2 { font-size: 1.1rem; margin-top: 1.75rem; }
      #prerender h3 { font-size: 0.95rem; margin-top: 1rem; }
      #prerender a { color: var(--color-lol-gold); text-decoration: none; }
      #prerender table { border-collapse: collapse; } #prerender td { padding: 0.2rem 0.9rem 0.2rem 0; }
      #prerender img { border-radius: 8px; vertical-align: middle; margin-right: 0.5rem; }
      #prerender .note { border-left: 2px solid var(--color-lol-border); padding-left: 0.9rem; font-size: 0.9rem; }
      body { background: var(--color-lol-dark); }`;

async function main() {
  const [championRows, augmentRows, itemRows, versions] = await Promise.all([
    fetchAllRows("champion_stats", "patch,queue_id,champion_id"),
    fetchAllRows("augment_stats", "patch,queue_id,augment_id,champion_id"),
    fetchAllRows("item_stats", "patch,queue_id,champion_id,item_id"),
    fetchJson("https://ddragon.leagueoflegends.com/api/versions.json"),
  ]);
  const [ddragon, cherry, itemsJson] = await Promise.all([
    fetchJson(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`),
    fetchJson(
      "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json",
    ),
    fetchJson(
      "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json",
    ),
  ]);

  const championNames = {};
  for (const champ of Object.values(ddragon.data)) championNames[champ.key] = champ.name;
  const augments = {};
  if (Array.isArray(cherry)) {
    // CommunityDragon names the field nameTRA; `name` only exists on some
    // older dumps. Falling straight through to "Augment 1194" (the old bug)
    // filled every generated page with ids instead of augment names.
    for (const a of cherry) {
      augments[a.id] = { name: a.nameTRA || a.name || "", rarity: a.rarity || "" };
    }
  }
  const itemNames = {};
  // Mirrors src/lib/dragon.ts: components are what a finished item was on the
  // way to, so they stay out of the build lists. Manamune and Archangel's
  // Staff transform rather than build into anything, so they stay in.
  const itemFinished = {};
  if (Array.isArray(itemsJson))
    for (const it of itemsJson) {
      itemNames[it.id] = it.name || "";
      const buildsInto = Array.isArray(it.to) ? it.to.length : 0;
      const builtFrom = Array.isArray(it.from) ? it.from.length : 0;
      const categories = Array.isArray(it.categories) ? it.categories : [];
      const price = it.priceTotal ?? 0;
      itemFinished[it.id] =
        (buildsInto === 0 &&
          !categories.includes("Consumable") &&
          (price >= 500 || it.id >= 100000)) ||
        (categories.includes("Boots") && builtFrom > 0);
    }

  const augmentName = (id) => augments[id]?.name || "";
  const itemName = (id) => itemNames[id] || "";

  // Reuse the built index.html's asset tags so pages hydrate with the same app
  const indexHtml = readFileSync(path.join(DIST, "index.html"), "utf8");
  const assetTags = (
    indexHtml.match(/<(script type="module"[^>]*><\/script>|link rel="stylesheet"[^>]*>)/g) || []
  )
    // The font stylesheet is in every template's head already; letting it
    // through here would emit it twice on each page
    .filter((tag) => !tag.includes("/fonts/inter.css"))
    .join("\n    ");

  const patches = [...new Set(championRows.map((r) => r.patch))];
  const latestPatch = patches.sort((a, b) => {
    const [am, an] = a.split(".").map(Number);
    const [bm, bn] = b.split(".").map(Number);
    return bm - am || bn - an;
  })[0];
  const buildDate = new Date().toISOString().slice(0, 10);

  const perChampion = new Map();
  const STAT_FIELDS = ["kills", "deaths", "assists", "damage", "damage_taken", "heal", "gold"];
  for (const r of championRows) {
    let e = perChampion.get(r.champion_id);
    if (!e) {
      e = { games: 0, wins: 0 };
      for (const f of STAT_FIELDS) e[f] = 0;
      perChampion.set(r.champion_id, e);
    }
    e.games += r.games;
    e.wins += r.wins;
    for (const f of STAT_FIELDS) e[f] += r[f] ?? 0;
  }

  // Mode-wide per-game averages, so each champion page can say how that
  // champion actually differs from the field instead of restating a template
  const modeTotals = { games: 0 };
  for (const f of STAT_FIELDS) modeTotals[f] = 0;
  for (const agg of perChampion.values()) {
    modeTotals.games += agg.games;
    for (const f of STAT_FIELDS) modeTotals[f] += agg[f];
  }
  const modeAvg = {};
  for (const f of STAT_FIELDS) modeAvg[f] = modeTotals.games ? modeTotals[f] / modeTotals.games : 0;
  // Ten champion slots per match
  const totalMatches = Math.round(modeTotals.games / 10);

  // Champions with enough games to lead cross-links
  const topChamps = [...perChampion.entries()]
    .sort((a, b) => b[1].games - a[1].games)
    .slice(0, 8)
    .map(([id]) => id)
    .filter((id) => championNames[id]);

  let pages = 0;
  let indexed = 0;
  // Only real, self-canonical URLs belong here. "/?tab=champions" is a tab
  // state of "/" whose canonical points back at "/", so submitting it just
  // earned an "Alternate page with proper canonical tag" in Search Console.
  const sitemapUrls = [
    { loc: `${SITE}/`, freq: "daily", pri: "1.0" },
    { loc: `${SITE}/guide/`, freq: "monthly", pri: "0.9" },
    { loc: `${SITE}/download/`, freq: "weekly", pri: "0.8" },
    { loc: `${SITE}/about/`, freq: "monthly", pri: "0.5" },
    { loc: `${SITE}/privacy/`, freq: "monthly", pri: "0.3" },
  ];

  for (const [id, agg] of perChampion) {
    const name = championNames[id];
    if (!name || agg.games < 1) continue;
    const slug = championSlug(name);
    const indexable = agg.games >= INDEX_MIN_GAMES;

    const champAugments = aggregate(
      augmentRows.filter((r) => r.champion_id === id),
      "augment_id",
    ).filter((a) => augmentName(a.key));
    const champItems = aggregate(
      itemRows.filter((r) => r.champion_id === id),
      "item_id",
    ).filter((i) => itemName(i.key) && itemFinished[i.key]);
    const coreBuild = rankForBuild(champItems, ITEM_MIN_PICKS, 6);
    const byRarity = (rarity) =>
      rankForBuild(
        champAugments.filter((a) => augments[a.key]?.rarity === rarity),
        AUGMENT_MIN_PICKS,
        4,
      );

    const wr = pct(agg.wins, agg.games);
    const kda = ((agg.kills + agg.assists) / Math.max(agg.deaths, 1)).toFixed(2);
    const moe = marginOfError(agg.wins, agg.games).toFixed(1);
    const perGame = {};
    for (const f of STAT_FIELDS) perGame[f] = agg[f] / agg.games;
    const pickRate = totalMatches ? (agg.games / totalMatches) * 100 : 0;

    const title = `${name} Build - ARAM Mayhem Augments, Items & Win Rate | MayhemStats`;
    const description = indexable
      ? `Best ${name} build for ARAM Mayhem: top augments, core items, and win rates from ${agg.games} community games. ${name} wins ${wr}% with a ${kda} KDA.`
      : `${name} in ARAM Mayhem: what ${plural(agg.games, "community game")} show so far - items, augments, and combat averages, with the sample size stated up front.`;
    const iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

    const buildList = coreBuild
      .map(
        (i) =>
          `<li><strong>${esc(itemName(i.key))}</strong> - ${pct(i.wins, i.picks)}% win rate over ${plural(i.picks, "game")} (score ${score(i.wins, i.picks).toFixed(1)})</li>`,
      )
      .join("\n            ");

    const raritySection = [
      ["Prismatic", "kPrismatic"],
      ["Gold", "kGold"],
      ["Silver", "kSilver"],
    ]
      .map(([label, key]) => {
        const best = byRarity(key);
        if (best.length === 0) return "";
        const lis = best
          .map(
            (a) =>
              `<li><strong>${esc(augmentName(a.key))}</strong> - ${pct(a.wins, a.picks)}% over ${plural(a.picks, "pick")}</li>`,
          )
          .join("\n              ");
        return `<h3>${label}</h3>\n            <ul>\n              ${lis}\n            </ul>`;
      })
      .filter(Boolean)
      .join("\n            ");

    const itemRowsHtml = champItems
      .filter((i) => i.picks >= ITEM_MIN_PICKS)
      .sort((a, b) => b.picks - a.picks)
      .slice(0, 10)
      .map(
        (i) =>
          `<tr><td>${esc(itemName(i.key))}</td><td>${i.picks}</td><td>${score(i.wins, i.picks).toFixed(1)}</td><td>${pct(i.wins, i.picks)}%</td></tr>`,
      )
      .join("\n              ");

    const crossLinks = topChamps
      .filter((cid) => cid !== id)
      .slice(0, 6)
      .map(
        (cid) =>
          `<a href="/champion/${championSlug(championNames[cid])}/">${esc(championNames[cid])}</a>`,
      )
      .join(" · ");

    // What actually separates this champion from the field, in words
    const readsList = [
      `deals ${num(perGame.damage)} damage per game (${relative(perGame.damage, modeAvg.damage)})`,
      `absorbs ${num(perGame.damage_taken)} (${relative(perGame.damage_taken, modeAvg.damage_taken)})`,
      perGame.heal > 0
        ? `heals or shields ${num(perGame.heal)} (${relative(perGame.heal, modeAvg.heal)})`
        : "",
      `earns ${num(perGame.gold)} gold (${relative(perGame.gold, modeAvg.gold)})`,
    ]
      .filter(Boolean)
      .map((s) => `<li>${s}</li>`)
      .join("\n        ");

    const confidence = indexable
      ? `Over ${plural(agg.games, "game")} that win rate carries a 95% margin of error of roughly ±${moe} points, so read it as a range (${(Number(wr) - Number(moe)).toFixed(1)}–${(Number(wr) + Number(moe)).toFixed(1)}%) rather than a fixed number.`
      : `That is only ${plural(agg.games, "game")} - far too few to call a win rate. The numbers below are here for completeness, this page is kept out of search until the sample is worth reading, and the fastest way to fix that is more contributors: <a href="/download/">run the tracker</a> and opt in.`;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
${indexable ? "" : '    <meta name="robots" content="noindex, follow" />\n'}    <link rel="canonical" href="${SITE}/champion/${slug}/" />
    <meta property="og:title" content="${esc(`${name} - ARAM Mayhem Build`)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}/champion/${slug}/" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${iconUrl}" />
    <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/fonts/inter.css" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" href="/icon.png" />
    ${assetTags}
    <style>
${PAGE_STYLE}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <section id="prerender">
      <p><a href="/">← MayhemStats: all champions</a></p>
      <h1><img src="${iconUrl}" alt="" width="40" height="40" loading="lazy" />${esc(name)} - ARAM Mayhem Build &amp; Stats</h1>
      <p>${esc(name)} wins <strong>${wr}%</strong> of ${plural(agg.games, "community game")} in ARAM Mayhem, with an average KDA of ${kda}${pickRate >= 1 ? `, appearing in ${pickRate.toFixed(1)}% of tracked matches` : ""}. All numbers come from anonymized games contributed by players running the free <a href="/download/">MayhemStats Tracker</a> app - never from ARAM or Arena stand-ins.</p>
      <p class="note">${confidence}</p>
      <h2>How ${esc(name)} plays in Mayhem</h2>
      <p>Per game, ${esc(name)}:</p>
      <ul>
        ${readsList}
      </ul>
      <p>Those averages are what the build below is chasing: in a mode where every player is drafting augments and fights start early, an item line that fits the champion's actual damage and durability profile matters more than a generic ARAM build order. <a href="/guide/">The Mayhem guide</a> explains how to read these numbers.</p>
      <h2>Core build</h2>
      <ol>
            ${buildList || `<li>No item has a winning record over ${ITEM_MIN_PICKS}+ games on ${esc(name)} yet.</li>`}
      </ol>
      <h2>Best augments</h2>
            ${raritySection || `<p>No augment has a winning record over ${AUGMENT_MIN_PICKS}+ picks on ${esc(name)} yet, so there is nothing worth recommending here.</p>`}
      <h2>Most-built items</h2>
      ${itemRowsHtml ? `<table>\n        <thead><tr><th>Item</th><th>Games</th><th>Score</th><th>Win rate</th></tr></thead>\n        <tbody>\n              ${itemRowsHtml}\n        </tbody>\n      </table>` : `<p>Item counts appear once an item reaches ${ITEM_MIN_PICKS} games on ${esc(name)}.</p>`}
      <p><em>Updated ${buildDate} · data through patch ${formatPatch(latestPatch)} · entries under ${ITEM_MIN_PICKS} games, or with a losing record, are not shown at all. Score is the win rate the record supports out of 100 - the floor of a 95% confidence interval - so a perfect record over a handful of games ranks below a solid one over hundreds. Components are left out; items that transform, like Manamune, are not components.</em></p>
      <p>More champions: ${crossLinks}</p>
      <p><a href="/guide/">ARAM Mayhem guide</a> · <a href="/about/">How these stats work</a> · <a href="/privacy/">Privacy</a></p>
      <p style="font-size:0.75rem">MayhemStats isn't endorsed by Riot Games. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.</p>
    </section>
  </body>
</html>
`;

    const dir = path.join(DIST, "champion", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), html);
    if (indexable) {
      sitemapUrls.push({ loc: `${SITE}/champion/${slug}/`, freq: "daily", pri: "0.8" });
      indexed++;
    }
    pages++;
  }

  // /community/ is a real route, but with no file on disk Cloudflare served
  // index.html for it - carrying index.html's canonical, so Google read the
  // page as a copy of the homepage. Give it its own file and canonical, the
  // same way champion pages work: real content for crawlers, SPA on top.
  try {
    const [totals] = await fetchJson(`${SUPABASE_URL}/rest/v1/community_totals?select=*`, {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    });
    // Matchup coverage is its own view; a missing one just drops the bullet
    let coverage = null;
    try {
      const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/matchup_coverage?select=*`, {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      });
      coverage = rows[0] ?? null;
    } catch {
      coverage = null;
    }
    const possibleMatchups = coverage ? (coverage.champions * (coverage.champions + 1)) / 2 : 0;
    const matchupLine = coverage
      ? `<li><strong>${Number(coverage.matchups).toLocaleString()}</strong> unique champion matchups seen - ${((coverage.matchups / possibleMatchups) * 100).toFixed(1)}% of the ${possibleMatchups.toLocaleString()} possible</li>`
      : "";
    const hours = Math.round(totals.total_seconds / 3600).toLocaleString();
    const games = Number(totals.games).toLocaleString();
    const contributors = Number(totals.contributors).toLocaleString();
    const cTitle = "Community Impact - ARAM Mayhem Games Contributed | MayhemStats";
    const cDesc = `${games} ARAM Mayhem games contributed by ${contributors} players, covering ${hours} hours of gameplay across ${totals.patches} patches. Every statistic on MayhemStats comes from these games.`;
    const communityHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(cTitle)}</title>
    <meta name="description" content="${esc(cDesc)}" />
    <link rel="canonical" href="${SITE}/community/" />
    <meta property="og:title" content="MayhemStats - Community Impact" />
    <meta property="og:description" content="${esc(cDesc)}" />
    <meta property="og:url" content="${SITE}/community/" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${SITE}/og.png" />
    <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/fonts/inter.css" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" href="/icon.png" />
    ${assetTags}
    <style>
${PAGE_STYLE}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <section id="prerender">
      <p><a href="/">← MayhemStats</a></p>
      <h1>Community impact</h1>
      <p>Riot's public API doesn't expose ARAM Mayhem match data, so every number on this site is crowdsourced: players run the free <a href="/download/">MayhemStats Tracker</a>, opt in, and pool their games anonymously.</p>
      <h2>The running total</h2>
      <ul>
        <li><strong>${contributors}</strong> contributors sharing their games</li>
        <li><strong>${games}</strong> games analyzed - ${(totals.games * 10).toLocaleString()} player performances</li>
        <li><strong>${hours} hours</strong> of ARAM Mayhem, end to end</li>
        ${matchupLine}
      </ul>
      <p>Each contributed game adds all ten players' champions, augments, items, and combat lines to the pool - anonymously, with duplicates counted once. The more players opt in, the sharper the tier lists get, especially early in a patch. Champions under ${INDEX_MIN_GAMES} games are deliberately kept out of search results until their sample says something.</p>
      <p><em>Updated ${buildDate}.</em></p>
      <p><a href="/guide/">ARAM Mayhem guide</a> · <a href="/about/">How these stats work</a> · <a href="/download/">Download the tracker</a> · <a href="/privacy/">Privacy</a></p>
      <p style="font-size:0.75rem">MayhemStats isn't endorsed by Riot Games. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.</p>
    </section>
  </body>
</html>
`;
    mkdirSync(path.join(DIST, "community"), { recursive: true });
    writeFileSync(path.join(DIST, "community", "index.html"), communityHtml);
    sitemapUrls.push({ loc: `${SITE}/community/`, freq: "daily", pri: "0.6" });
  } catch (err) {
    // Fail soft like the rest of this script: without a file the SPA route
    // still works, it just stays out of the sitemap rather than being
    // submitted as a duplicate of the homepage.
    console.warn(`prerender: community page skipped (${err.message})`);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
  writeFileSync(path.join(DIST, "sitemap.xml"), sitemap);

  console.log(
    `prerender: ${pages} champion pages (${indexed} indexable, ${pages - indexed} noindex under ${INDEX_MIN_GAMES} games) + sitemap (${sitemapUrls.length} urls)`,
  );
}

main().catch((err) => {
  console.warn(`prerender skipped: ${err.message} - deploying as plain SPA`);
});
