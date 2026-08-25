# MayhemStats — Community Stats Website

[mayhemstats.com](https://mayhemstats.com/) — public site showing community
augment and champion tier lists, builds, and win rates for ARAM Mayhem, built
from anonymized games contributed by MayhemStats Tracker players who opt in.

It's a static Vite + React app with no backend of its own: data comes from the
community Supabase project's aggregate-only views (`champion_stats`,
`augment_stats`), and champion/augment names and icons come from Data Dragon
and CommunityDragon in the browser. The raw match tables are locked behind row
level security — the views expose counts grouped by patch/queue/champion/
augment and nothing else.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # typechecks, then outputs to dist/
```

## Enabling ads

The AdSense integration ships inert: no ad scripts load and no layout space
is reserved until configured. After AdSense approval:

1. Put your publisher id (`ca-pub-…`) in `src/lib/adsense.ts` as `AD_CLIENT`.
2. Create two responsive display units in the AdSense dashboard and put
   their slot ids in `AD_SLOTS` (top = below the filter bar, bottom = above
   the footer).
3. Replace the placeholder in `public/ads.txt` with the line AdSense shows
   under Account → ads.txt.
4. Turn on consent messaging in AdSense under Privacy & messaging (served
   automatically by the same script — no code changes).

Setting `AD_CLIENT` back to an empty string fully disables ads again.

## Deploy

Any static host works. On Vercel: import the repository, set the project's
**Root Directory** to `website`, and the defaults (Vite framework preset,
`npm run build`, `dist` output) do the rest.

The build reads a few modules from `../src/shared` — the scoring and tier
maths, the augment descriptions, the design tokens — so that the site and the
desktop app cannot disagree about them. It still builds *from* this directory;
it just needs the repository checked out whole, which is what Cloudflare Pages
and GitHub Actions do by default. On Vercel, keep **Include source files
outside of the Root Directory** enabled.
