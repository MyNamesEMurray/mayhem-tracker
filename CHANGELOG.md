# Changelog

Written for players, not programmers. The release workflow copies the
matching version's section into the GitHub release notes, and the app shows
it in the update window — so every entry here should be readable at a
glance: what changed, why you'd care. Newest first. Only credit people by
name when a change came from their reported issue or suggestion.

The update window shows every version between what someone is running and
what they're installing, so a bullet fixing a bug we shipped can reach
people who never ran the broken build. Mark those with the release that
introduced the problem:

    - <!--fixes:v2.10.0--> Fixed the app opening as if it were a fresh install.

Anyone upgrading from before v2.10.0 won't be shown it; anyone who ran
v2.10.0 will. GitHub hides the comment when rendering, and only fixes for
bugs of our own making need it — a fix for a long-standing bug or something
on Riot's end is news to everyone, so leave those unmarked.

## v2.12.8 — 2026-08-24

- <!--fixes:v2.12.7--> **Fixed the Augments tab sitting on "Loading..." forever.** Upgrading to v2.12.7 left a community cache from the previous version on disk, written before the augment rollup existed. Anything inside its six-hour window was read back as if it had one, and the augment list waited on a request that had already failed. The cache now records which version wrote it and is refetched when that doesn't match, so this can't recur the next time the shape changes. A failed load also says what went wrong and offers a retry, instead of showing "Loading..." indefinitely.
- **Dropped the Multikills column from Champions.** Across 137,000 games a per-champion multikill total says more about how often a champion is picked than how it plays, and it was clipping the edge of the window. The remaining columns get the space back.

## v2.12.7 — 2026-08-24

- **The Augments tab can show the community's games.** The source switch that Champions has now sits on Augments too, so you can flip between your own augment picks and everyone's without leaving the tab. Expanding an augment loads which champions carry it across the whole pool. The tab now mirrors the website: one ranked list, no separate views.
- **The source switch is app-wide.** Turn on Community on Champions and the Augments tab is already showing community numbers when you get there, and the other way round. It sticks between launches, and a champion page opened without an explicit link follows it too.
- **"My games" is now "My performance"**, which is what it actually means — how these have gone for *you*, not a different set of games.
- **Community stats stay give-to-get.** The Community switch on Champions and Augments is only usable while you're sharing your games. Off, it sits there greyed out and tells you where to turn it on — or where to read the same numbers on the website without doing so. Turning it on in Settings unlocks it straight away, no restart.
- **Removed: My Lobbies, and the augment pick-slot and best-pairs views.** My Lobbies showed everyone in your own games, which was worth having before there was a community pool and is thin next to 137,000 games now. The two augment views went the same way — the app's Augments tab is the website's, plus the community switch. If you miss any of them, say so and they can come back.

## v2.12.6 — 2026-08-24

- **Every column sorts.** Click any header on Champions, Augments, Friends or a champion's item and augment tables and the table sorts by it — click again to reverse. Champion and augment names sort A→Z, numbers sort biggest-first, and the columns that never responded to a click before — Tier, Pick Rate, Player, Champion, the per-slot augment win rates, the augment pairs — now do. Headers are keyboard-reachable and announce their sort state to a screen reader.

## v2.12.5 — 2026-08-24

- **One Score, everywhere.** Champions were ranked one way and items and augments another, both called "Score" — two numbers wearing one name. Everything now uses the confidence score: the win rate the games behind an entry will support, out of 100. Champion tiers shift a little as a result, and the shift is the point — on a fresh patch a champion with fifteen games no longer sits above one with two hundred. Over a full patch range almost nothing moves, because there the evidence is in.

- The community stats load again, and load fast. With 136,000 games in the database the app was downloading every augment and item row in existence — more than half a million of them — before it could draw a champion page, and the server started refusing the request outright. It now pulls the champion table up front and fetches a champion's augments and items when you open that champion, keeping the last two dozen you looked at in memory so flipping between them is instant. <!--fixes:v2.12.0-->
- <!--fixes:v2.12.2--> **Items and augments are ranked by the record behind them, not just the record.** A 5-game item at 100% was landing above Warmog's Armor at 60.1% over 2,635 games — the old ranking all but tied them, which is the wrong answer at 500 times the evidence. Every list now shows a **Score out of 100**: the win rate the games actually support, so a perfect handful of games starts low and climbs as it proves itself, instead of arriving at the top and sliding down. The five-game item scores 56.6; Warmog's scores 58.2.
- **Components are out of the build lists.** Ruby Crystal, Giant's Belt and Recurve Bow were showing up with win rates earned by sitting in someone's inventory at the final whistle, not by being anyone's plan. Items that only _look_ like components stay: Manamune and Archangel's Staff transform rather than build into anything, so they read as the finished items they are. A **Components** button in the list header brings the parts back if you want them.
- Tier-2 boots are back in the build lists and build paths. Ionian Boots of Lucidity, Berserker's Greaves and four others were being treated as parts because they cost under 1000g — a boot counts because it's built from the boots everyone starts with, not because of its price.
- Long item names are no longer cut off on a phone. "Overlord'..." now reads as Overlord's Bloodmail: the number columns give up some width, the win-rate meter steps aside for its percentage, and a name that needs two lines gets them.

## v2.12.4 — 2026-08-23

- Win rates line up in a column again. The `*` marking a small sample sat inside the number, so a starred row pushed its percentage a character to the left and the column zig-zagged; the asterisk now keeps its own space whether or not it's shown, and the digits are set in tabular figures so they stay in step too. Fixed on the champion table, the champion page's augment lists, and the augment slot table.

## v2.12.3 — 2026-08-23

- The item and augment lists on a champion page no longer show entries with fewer than five picks. Ranking blends the win rate with how much data stands behind it, but at two or three picks a perfect record could still edge out a solid one over thirty games — so the rows too thin to rank are simply left out rather than competing. The lists say so underneath.

## v2.12.2 — 2026-08-23

- <!--fixes:v2.7.0--> **Item and augment lists were ranked by how often something was built, not by how well it did.** The most *popular* entry sat at the top of a list that reads as "what works" — two different questions, and the pick count in each row already answered the first. Both lists now rank by the same shrunk win rate everything else uses, on the site as well as in the app.
- The champion page's item and augment lists gained what the website has: **item names**, a **search box** for each list, a **rarity filter** for augments, and a control to rank by score, win rate, or games.
- A champion page with too little data on the current patch now **reaches back a patch at a time** until there's enough to say something, exactly as [mayhemstats.com](https://mayhemstats.com/) does — with a note saying which patches it used, and a one-click way back to the single patch.
- The Champions tab opens faster. Community stats download in parallel instead of one page at a time, carry only the columns the app reads, start loading when the app does, and an out-of-date cache is shown immediately while a fresh copy arrives behind it.

## v2.12.1 — 2026-08-23

- Clicking a champion now opens a **full champion page** rather than a strip inside the table row: tier, score, win rate, the core build, and the best augments for each rarity, laid out the way the champion pages on [mayhemstats.com](https://mayhemstats.com/) are. It follows whichever source you're on — your own games, or the community's.
- The champion table gained **Tier**, **Score** and **Pick rate** columns and sorts by score by default, using the same ranking the website uses. A champion should read the same in both places, and now does.
- <!--fixes:v2.12.0--> Community kills, deaths and assists are rounded to one decimal again, and damage and gold to whole numbers. They were arriving as raw averages — 10.633333333333333 kills — in the table.
- <!--fixes:v2.12.0--> Fixed the patch filter clearing itself while you browse community stats for a patch you haven't played yourself.

## v2.12.0 — 2026-08-23

- The **Champions** tab can now show everyone's games, not just yours. A **My games / Community** switch sits above the table: flip it and the champions, augments, and items all come from the shared database behind [mayhemstats.com](https://mayhemstats.com/), so looking up a build no longer means leaving the app. Expand a champion and you get its best augments and items across every contributed game.
- Those community numbers are stored on your machine and refresh a few times a day, with a **refresh** link when you want them sooner. If you're offline they keep showing whatever they last had rather than going blank.
- **"Global" is now "My Lobbies"** — which is all it ever was: everyone who turned up in _your_ matches. The old name sounded like it meant everyone's games, so an empty champion row read as "nobody plays this" when it really meant "you haven't played with one".
- The app now ships with its own font instead of borrowing whichever one your operating system hands it, so it looks the same everywhere — and matches the website.

## v2.11.3 — 2026-08-22

- Poro-Snax no longer counts as a purchased item in the community build paths on [mayhemstats.com](https://mayhemstats.com/). It's handed out for free, so it was showing up as the first "buy" for every champion and pushing a real item out of the row. The app already hid it from your own match build orders; now it stops being sent up with them too.

## v2.11.2 — 2026-08-16

- "Last game Xm ago" now counts from when the game **ended** rather than when it started. A 28-minute game that began 34 minutes ago was being reported as 34 minutes ago when you'd actually finished playing 6 minutes earlier.

## v2.11.1 — 2026-08-16

- Match rows now show **when a game was played** — the date and clock time — instead of "3d ago". The old text was also being cut off mid-sentence on the Overview page, so the part that got hidden was exactly the part that told you when.
- "Last game Xm ago" and the friends list still count in relative time, where that's the useful reading.

## v2.11.0 — 2026-08-16

- The update window now shows **everything** you're about to install, not just the newest version's notes. Skipping three releases used to mean seeing one of them; now each version gets its own heading.
- Notes about bugs from a version you never ran are left out, so you aren't warned about problems that never reached you.

## v2.10.2 – v2.10.3 — 2026-08-16

- Fixed **Backfill history** failing with a "403" error and staying broken. The app remembers which of Riot's regional match-history servers answers for your account; if that changes, or your client's sign-in expires, it now re-checks and retries instead of failing every time from then on. If Riot still refuses, the message now says which of its servers refused, whether your client's sign-in belongs to the account being looked up, and Riot's own reason — so a report is enough to diagnose it.

## v2.10.1 — 2026-08-16

- <!--fixes:v2.10.0--> **Fixes v2.10.0 opening as if it were a fresh install.** The rename moved where the app looked for your data, so it found nothing and started over. Your match history was never deleted — it was sitting in the old folder the whole time, and this release moves it into place on first launch. Nothing to do but update.
- <!--fixes:v2.10.0--> If you ran v2.10.0 and recorded games in it, those stay behind in a leftover `Mayhem Tracker` folder in AppData; your original history takes priority. That folder is safe to delete once you've confirmed your games are back.

## v2.10.0 — 2026-08-16

- The app is now called **MayhemStats Tracker**, matching the site it powers. Nothing else changes: your match history, settings, and community contributions all carry over untouched.
- mayhemstats.com now has a proper [download page](https://mayhemstats.com/download/) — both builds, what to do about the Windows SmartScreen warning, and straight answers on what the app does and doesn't send.

## v2.9.3 — 2026-08-16

- Match rows now breathe with the window: the spacing between item and augment icons, and between the row's sections, grows smoothly as you widen the app instead of staying pinned at its smallest size.

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
