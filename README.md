# Mayhem Tracker — Community Edition

Desktop app for tracking ARAM Mayhem match history in League of Legends. Connects to the League Client (LCU) to automatically record matches and display stats — and, if you opt in, contributes your games **anonymously** to the community database behind the public stats site:

**[MayhemStats.com](https://mayhemstats.com/)** — augment and champion tier lists, win rates, and per-champion ideal builds, powered entirely by games contributed by players running this app.

<img width="1306" height="820" alt="image" src="https://github.com/user-attachments/assets/5fc0ad6d-5f68-4cf3-a775-fb3e8f379ac9" />

## Why this exists

Riot's public API doesn't expose ARAM Mayhem's mode data — augment picks, in
particular, never appear in Match-V5. That's why the big stats sites can cover
ranked and ARAM but have nothing for Mayhem: **the data to build tier lists
simply isn't available to anyone**. The one place it does exist is the League
client itself, which holds the full post-game breakdown of your own matches.

So this project crowdsources it. The tracker reads your matches from your own
client, and players who opt in pool anonymized copies into a shared database.
Every augment win rate and ideal build on
[MayhemStats.com](https://mayhemstats.com/) exists only because players chose
to share their games — there is no other source.

## Features

- Automatic match detection via League Client API
- Supports the limited-time ARAM Mayhem and Mayhem Classic queues
- Match history with detailed game breakdowns
- Champion, augment, and friend stats with win rates
- Aggregate statistics from all players in your games
- Local SQLite database — your data lives on your machine
- **Opt-in community stats**: share anonymized games with everyone via [MayhemStats.com](https://mayhemstats.com/)

## Download

Grab `MayhemTracker.exe` from the [latest release](https://github.com/MyNamesEMurray/mayhem-tracker/releases/latest). It's a portable exe — no installer. The app checks for updates automatically.

## Community stats & privacy

Contributing is **off by default**. Flip it on in **Settings → Community Stats**, and after each game (plus your existing history, once) the app uploads an anonymous record of the match.

**What an upload contains**, for each of the ten players in a game: champion, augments, items, and combat stat lines (kills/deaths/assists, damage, healing, gold, multikills), plus the match's queue, patch, duration, and region + game id (so the same game uploaded by two players is only counted once).

**What is never uploaded**: summoner names, Riot IDs, tag lines, profile icons, puuids, or anything else that identifies a player. The server's database schema has no columns for identity data, and the public website can only read aggregate views (counts grouped by patch/queue/champion/augment) — never individual games.

Uploads are tied to a random token generated on your machine (not derived from any account data) so you can rate-limit abuse and use **Settings → Delete my contributions** to remove everything you've shared at any time. Games no one else contributed are deleted entirely.

## Tech Stack

Electron + React + TypeScript, built with electron-vite. Uses Tailwind CSS for styling, better-sqlite3 for local storage, and league-connect for LCU integration. The community backend is Supabase (Postgres + edge functions) and the website is a static Vite app in [`website/`](website/).

## Development

```bash
npm install
npm run rebuild   # rebuild native modules for Electron
npm run dev       # start in dev mode
```

## Build

```bash
npm run dist      # build Windows portable executable
```

## Credits

Forked from [Yhprum/mayhem-tracker](https://github.com/Yhprum/mayhem-tracker) — the original tracker this community edition builds on.

## Disclaimer

Mayhem Tracker was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
