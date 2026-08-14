// Post-build prerender: generates a static HTML page per champion at
// dist/champion/<slug>/index.html plus a sitemap covering them, from the
// live community data. Each page carries real content (title, description,
// build summary) for crawlers and no-JS visitors; the interactive app boots
// on top and replaces it for everyone else.
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

async function fetchAllRows(view) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/${view}?select=*`, {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Range: `${from}-${from + 999}`,
    });
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// Mirrors src/lib/slug.ts — keep in sync
const championSlug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Mirrors src/lib/stats.ts score()
const score = (wins, games) => (100 * (wins + 10)) / (games + 20);

// Mirrors src/lib/stats.ts formatPatch(): stored patches are year-based
// ("26.16"); shifting stray client-style values ("16.16") is idempotent
const formatPatch = (patch) => {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${m[2]}` : patch;
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pct = (wins, n) => (n > 0 ? ((wins / n) * 100).toFixed(1) : "0.0");

// Entries with a workable sample ranked by score, low-sample filler after —
// mirrors src/lib/stats.ts rankForBuild
function rankForBuild(list, minPicks, count) {
  const qualified = list
    .filter((x) => x.picks >= minPicks)
    .sort((a, b) => score(b.wins, b.picks) - score(a.wins, a.picks));
  const filler = list.filter((x) => x.picks < minPicks).sort((a, b) => b.picks - a.picks);
  return [...qualified, ...filler].slice(0, count);
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

async function main() {
  const [championRows, augmentRows, itemRows, versions] = await Promise.all([
    fetchAllRows("champion_stats"),
    fetchAllRows("augment_stats"),
    fetchAllRows("item_stats"),
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
    for (const a of cherry) augments[a.id] = { name: a.name || `Augment ${a.id}`, rarity: a.rarity || "" };
  }
  const itemNames = {};
  if (Array.isArray(itemsJson)) for (const it of itemsJson) itemNames[it.id] = it.name || `Item ${it.id}`;

  // Reuse the built index.html's asset tags so pages hydrate with the same app
  const indexHtml = readFileSync(path.join(DIST, "index.html"), "utf8");
  const assetTags = (indexHtml.match(/<(script type="module"[^>]*><\/script>|link rel="stylesheet"[^>]*>)/g) || [])
    .map((t) => (t.startsWith("<script") ? t : t))
    .join("\n    ");

  const patches = [...new Set(championRows.map((r) => r.patch))];
  const latestPatch = patches.sort((a, b) => {
    const [am, an] = a.split(".").map(Number);
    const [bm, bn] = b.split(".").map(Number);
    return bm - am || bn - an;
  })[0];
  const buildDate = new Date().toISOString().slice(0, 10);

  const perChampion = new Map();
  for (const r of championRows) {
    let e = perChampion.get(r.champion_id);
    if (!e) perChampion.set(r.champion_id, (e = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 }));
    e.games += r.games;
    e.wins += r.wins;
    e.kills += r.kills;
    e.deaths += r.deaths;
    e.assists += r.assists;
  }

  // Top champions by games, for cross-links
  const topChamps = [...perChampion.entries()]
    .sort((a, b) => b[1].games - a[1].games)
    .slice(0, 8)
    .map(([id]) => id)
    .filter((id) => championNames[id]);

  let pages = 0;
  const sitemapUrls = [
    { loc: `${SITE}/`, freq: "daily", pri: "1.0" },
    { loc: `${SITE}/?tab=champions`, freq: "daily", pri: "0.9" },
    { loc: `${SITE}/about/`, freq: "monthly", pri: "0.5" },
    { loc: `${SITE}/community/`, freq: "daily", pri: "0.5" },
    { loc: `${SITE}/privacy/`, freq: "monthly", pri: "0.3" },
  ];

  for (const [id, agg] of perChampion) {
    const name = championNames[id];
    if (!name || agg.games < 1) continue;
    const slug = championSlug(name);

    const champAugments = aggregate(
      augmentRows.filter((r) => r.champion_id === id),
      "augment_id",
    );
    const champItems = aggregate(
      itemRows.filter((r) => r.champion_id === id),
      "item_id",
    );
    const coreBuild = rankForBuild(champItems, 3, 6);
    const byRarity = (rarity) =>
      rankForBuild(champAugments.filter((a) => augments[a.key]?.rarity === rarity), 2, 4);

    const wr = pct(agg.wins, agg.games);
    const kda = ((agg.kills + agg.assists) / Math.max(agg.deaths, 1)).toFixed(2);
    const title = `${name} Build — ARAM Mayhem Augments, Items & Win Rate | MayhemStats`;
    const description = `Best ${name} build for ARAM Mayhem: top augments, core items, and win rates from ${agg.games} community games. ${name} wins ${wr}% with a ${kda} KDA.`;
    const iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

    const buildList = coreBuild
      .map(
        (i) =>
          `<li><strong>${esc(itemNames[i.key] ?? `Item ${i.key}`)}</strong> — ${pct(i.wins, i.picks)}% win rate over ${i.picks} game${i.picks === 1 ? "" : "s"}</li>`,
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
              `<li><strong>${esc(augments[a.key]?.name ?? `Augment ${a.key}`)}</strong> — ${pct(a.wins, a.picks)}% over ${a.picks} pick${a.picks === 1 ? "" : "s"}</li>`,
          )
          .join("\n              ");
        return `<h3>${label}</h3>\n            <ul>\n              ${lis}\n            </ul>`;
      })
      .filter(Boolean)
      .join("\n            ");

    const itemTable = champItems
      .sort((a, b) => b.picks - a.picks)
      .slice(0, 10)
      .map(
        (i) =>
          `<tr><td>${esc(itemNames[i.key] ?? `Item ${i.key}`)}</td><td>${i.picks}</td><td>${pct(i.wins, i.picks)}%</td></tr>`,
      )
      .join("\n              ");

    const crossLinks = topChamps
      .filter((cid) => cid !== id)
      .slice(0, 6)
      .map((cid) => `<a href="/champion/${championSlug(championNames[cid])}/">${esc(championNames[cid])}</a>`)
      .join(" · ");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${SITE}/champion/${slug}/" />
    <meta property="og:title" content="${esc(`${name} — ARAM Mayhem Build`)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}/champion/${slug}/" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${iconUrl}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" href="/icon.png" />
    ${assetTags}
    <style>
      #prerender { max-width: 780px; margin: 0 auto; padding: 2rem 1.25rem 3rem; color: #94a0b8;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; }
      #prerender h1, #prerender h2, #prerender h3 { color: #e8ecf4; }
      #prerender h1 { font-size: 1.5rem; } #prerender h2 { font-size: 1.1rem; margin-top: 1.75rem; }
      #prerender h3 { font-size: 0.95rem; margin-top: 1rem; }
      #prerender a { color: #c89b3c; text-decoration: none; }
      #prerender table { border-collapse: collapse; } #prerender td { padding: 0.2rem 0.9rem 0.2rem 0; }
      #prerender img { border-radius: 8px; vertical-align: middle; margin-right: 0.5rem; }
      body { background: #0b0e14; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <section id="prerender">
      <p><a href="/">← MayhemStats: all champions</a></p>
      <h1><img src="${iconUrl}" alt="" width="40" height="40" loading="lazy" />${esc(name)} — ARAM Mayhem Build &amp; Stats</h1>
      <p>${esc(name)} wins <strong>${wr}%</strong> of ${agg.games} community games in ARAM Mayhem, with an average KDA of ${kda}. All numbers come from anonymized games contributed by players running the free <a href="https://github.com/MyNamesEMurray/mayhem-tracker/releases/latest">Mayhem Tracker</a> app.</p>
      <h2>Core build</h2>
      <ol>
            ${buildList || "<li>Not enough item data yet.</li>"}
      </ol>
      <h2>Best augments</h2>
            ${raritySection || "<p>Not enough augment data yet.</p>"}
      <h2>Most-built items</h2>
      <table>
        <tbody>
              ${itemTable}
        </tbody>
      </table>
      <p><em>Updated ${buildDate} · data through patch ${formatPatch(latestPatch)} · win rates under 20 games carry low confidence.</em></p>
      <p>More champions: ${crossLinks}</p>
      <p><a href="/about/">How these stats work</a> · <a href="/privacy/">Privacy</a></p>
      <p style="font-size:0.75rem">MayhemStats isn't endorsed by Riot Games. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.</p>
    </section>
  </body>
</html>
`;

    const dir = path.join(DIST, "champion", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), html);
    sitemapUrls.push({ loc: `${SITE}/champion/${slug}/`, freq: "daily", pri: "0.8" });
    pages++;
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

  console.log(`prerender: ${pages} champion pages + sitemap (${sitemapUrls.length} urls)`);
}

main().catch((err) => {
  console.warn(`prerender skipped: ${err.message} — deploying as plain SPA`);
});
