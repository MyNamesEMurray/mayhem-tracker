# Changelog

Written for players, not programmers. The release workflow copies the
matching version's section into the GitHub release notes, and the app shows
it in the update window — so every entry here should be readable at a
glance: what changed, why you'd care. Newest first. Only credit people by
name when a change came from their reported issue or suggestion.

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
