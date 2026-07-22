# Mayhem Tracker

Desktop app for tracking ARAM Mayhem match history in League of Legends. Connects to the League Client (LCU) to automatically record matches and display stats.

<img width="1306" height="820" alt="image" src="https://github.com/user-attachments/assets/5fc0ad6d-5f68-4cf3-a775-fb3e8f379ac9" />

## Features

- Automatic match detection via League Client API
- Supports the limited-time ARAM Mayhem Classic-ish game mode
- Match history with detailed game breakdowns
- Champion, augment, and friend stats with win rates
- Aggregate statistics from all players in your games
- Local SQLite database

## Tech Stack

Electron + React + TypeScript, built with electron-vite. Uses Tailwind CSS for styling, better-sqlite3 for local storage, and league-connect for LCU integration.

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

## Disclaimer

Mayhem Tracker was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
