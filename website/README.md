# MayhemStats — Community Stats Website

[mayhemstats.com](https://mayhemstats.com/) — public site showing community
augment and champion tier lists, builds, and win rates for ARAM Mayhem, built
from anonymized games contributed by Mayhem Tracker players who opt in.

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

## Deploy

Any static host works. On Vercel: import the repository, set the project's
**Root Directory** to `website`, and the defaults (Vite framework preset,
`npm run build`, `dist` output) do the rest.
