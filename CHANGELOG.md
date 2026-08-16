# Changelog

Written for players, not programmers. The release workflow copies the
matching version's section into the GitHub release notes, and the app shows
it in the update window — so every entry here should be readable at a
glance: what changed, why you'd care. Newest first. Only credit people by
name when a change came from their reported issue or suggestion.

## v2.9.2 — 2026-08-16

- Champions, Augments and Global tables now use a maximized window too: win-rate meters grow with the space and champion icons scale up, instead of leaving wide empty columns.
- Fixed a faint vertical seam that could show across match rows on large displays.

## v2.9.1 — 2026-08-16

- Match rows now rearrange for wide windows instead of leaving a big empty stripe: bigger champion, item and augment icons, items and augments laid out in a single row, longer damage bars, and gold earned added to the row.

## v2.9.0 — 2026-08-16

- Maximizing the window now actually uses the space: every stats page fills the width, and match rows stretch their damage bars instead of leaving a gap.
- Filter dropdowns keep a fixed width, so choosing a champion or patch no longer nudges the controls beside them.
- The scrollbar no longer shifts the page sideways when it appears or disappears — in the app and on mayhemstats.com.
- Developer tools are hidden by default now. Press Ctrl+Shift+D to show them in Settings (and again, or the Hide button, to put them away).

## v2.8.5 — 2026-08-16

- Finished games now appear almost immediately. The app reads your match straight from the end-of-game screen instead of waiting for Riot's match history to catch up, which was taking several minutes.

## v2.8.4 — 2026-08-16

- The app now keeps watching for a finished match for a couple of minutes after the game ends, instead of giving up after 40 seconds — Riot's client sometimes takes that long to publish it.
- New **Sync diagnostics** readout (Settings → Developer) showing what was recorded, when the app last checked, and what it told the window — with a copy button, for reporting problems.

## v2.8.3 — 2026-08-16

- Fixed the game list not showing matches that were already recorded in the background — Refresh now always re-reads your stored games, and the app catches up on its own whenever you bring the window back to the front.

## v2.8.2 — 2026-08-15

- The "Last game Xm ago" label on the Overview page now counts up on its own while the app is open, instead of freezing at whatever it said when the page loaded.

## v2.8.1 — 2026-08-15

- Fixed new games not appearing until you clicked Refresh. Finished matches now show up on their own again, and history imports that run in the background report themselves too.
- Games also land faster: instead of waiting for the next check, the app grabs a match within seconds of the end-of-game screen.

## v2.8.0 — 2026-08-15

- New **Start with Windows** option (Settings → General). Mayhem Tracker signs in with you and waits in the tray, so games are recorded and synced without opening it first — no window pops up at login.

## v2.7.0 — 2026-08-14

- Build orders now feed the community stats: if you share match data, the item purchase timings your app records (for all ten players in your games) upload with them — still fully anonymous.
- mayhemstats.com champion pages gained a **Typical build path** section showing the order items are actually bought and when, built from live-tracked games. It appears per champion once enough tracked games exist.

## v2.6.0 — 2026-08-14

- **Build orders**: while you play, the app now records the order every player buys their items in — open any tracked match's details to see each player's item timeline with minute stamps. Works automatically for games played with the app running (window or tray); can be turned off in Settings → General.
- Augments that grant an active ability show up in the build order too, with when they were picked. (Riot's live data doesn't expose the augment choices you're offered, so offered-vs-taken stats aren't possible — we checked.)

## v2.5.2 — 2026-08-14

- The update window now shows what's new right inside the app, before you click update.
- Release notes on GitHub are now written for humans — this changelog is the source.

## v2.5.1 — 2026-08-14

- Fixed updating the installed version hanging with a blank command window. Updates now install silently in the background and relaunch the app when done.
- New **Check for updates** button in Settings → General, and the app now re-checks on its own every few hours instead of only at launch.

## v2.5.0 — 2026-08-14

- New Developer option (Settings → Developer) to record live game data to local files during matches — groundwork for upcoming item purchase-order and augment timing stats. Off by default, and recordings never leave your PC.

## v2.4.1 — 2026-08-13

- In-app updates now work for the installed version too, not just the portable exe.

## v2.4.0 — 2026-08-13

- The Global tab now unlocks by contributing your games to the community pool. Until then it shows live community totals and a one-click way to opt in.
- Fixed item icons sometimes staying broken in match history rows until you switched tabs.

## v2.3.2 — 2026-08-13

- Patch numbers now match Riot's naming everywhere — patch 26.16 instead of the internal 16.16. Your database converts itself on first launch.

## v2.3.1 — 2026-08-12

- The portable download is now clearly named `MayhemTracker-Portable.exe`.
- Fixed the updater accidentally downloading the installer instead of the portable exe.

## v2.3.0 — 2026-08-12

- Augments page: new **By pick slot** and **Best pairs** views.
- The database is now about 3× smaller, and the app frees its memory while minimized to the tray.
- New installer download (`MayhemTracker-Setup.exe`) alongside the portable exe.
- Every stats page now opens on the current patch and ARAM Mayhem queue, matching mayhemstats.com.
- Imported backup files can no longer be re-uploaded to community stats, keeping the shared data trustworthy.
- The app finally shows its real name and icon in Task Manager.

## v2.2.0 — 2026-08-11

- New first-run tour covering what the app does and how community sharing works.
- Full visual redesign matching mayhemstats.com, including the new crossed-swords look.

## v2.0.0 – v2.1.0 — 2026-08-09

- Community stats: opt-in anonymous sharing powering mayhemstats.com — tier lists, augment win rates, and builds from real Mayhem games.
- Site and app rebranded as MayhemStats with a unified design.
