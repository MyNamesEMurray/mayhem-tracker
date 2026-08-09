# design-sync notes — mayhem-tracker

- App repo, not a packaged library: the bundle entry is the hand-authored
  `.design-sync/ds-entry.ts` (passed via `--entry`), which curates 31 exports
  across two trees — `website/src/components/` (canonical brand set) and
  `src/renderer/components/` (desktop stat components + icon set). Where names
  collide (AugmentIcon, ChampionIcon, ItemIcon, RarityFilter, WinRateBar), the
  website version is exported; the renderer versions still bundle as internals
  of MatchScoreboard.
- CSS is compiled Tailwind v4: `cfg.buildCmd` runs the CLI over
  `website/src/global.css` from the repo root so source auto-detection scans
  BOTH component trees plus `.design-sync/previews/`. Re-run it whenever
  previews gain new utility classes.
- Card canvas: the emitted preview cards are white; MayhemStats is a
  dark-canvas system, so every authored preview wraps its content in a
  `background: var(--color-lol-dark)` container. Keep doing this for new
  previews — unwrapped small components look washed out.
- Sandbox quirk (this managed environment only): chromium hangs on external
  CDN requests (Data Dragon / CommunityDragon champion, item, augment,
  profile icons) because there's no direct network. Fix: point
  `DS_CHROMIUM_PATH` at `.design-sync/.cache/chromium-offline.sh` (wrapper
  adds `--no-proxy-server --host-resolver-rules NXDOMAIN-everything except
  127.0.0.1`) so requests fail fast and `networkidle` is reachable. On a
  normal machine with internet this wrapper is unnecessary (icons will
  actually render in captures).
- Because of the above, review sheets in this sandbox show broken/blank
  champion, item, augment, and profile icon images. That's environmental —
  the URLs are correct and load in the claude.ai/design runtime. Grade the
  non-image parts.
- Playwright: ESM import needs `playwright` resolvable from `.ds-sync/` —
  symlink the global install (`ln -sfn /opt/node22/lib/node_modules/playwright
  .ds-sync/node_modules/playwright`, plus `playwright-core` from its
  node_modules) on this machine; a normal machine can just `npm i playwright`
  in `.ds-sync/`.

## Authoring recipes (folded from the first-sync waves)

- Icons (`src/renderer/components/icons.tsx`): no `size` prop — they spread
  `SVGProps<SVGSVGElement>` with defaults `width/height="1em"`,
  `stroke="currentColor"`. Size with `width={n} height={n}`; color via CSS
  `color` on an ancestor.
- MatchScoreboard preview needs a `window.api` shim (`getAugmentData`,
  `getItemData`, `getChampionData`) defined at module top — the renderer
  AugmentIcon/ItemIcon call the Electron bridge in mount effects and unmount
  the tree without it. Any preview rendering renderer-hook components needs
  the same.
- Offline-sandbox img collapse: components hide failed CDN `<img>`s via
  onError `display:none`, which deletes grid tracks and misaligns rows. The
  MatchScoreboard preview carries a scoped
  `img { display:inline-block !important; font-size:0 !important }` override
  so broken images keep their attribute box. Capture-env only; harmless in
  production.
- Capture viewport is fixed 900x700. Wide/tall flagship views fit via
  in-preview `zoom` (AugmentsTable 0.85, MatchScoreboard 0.82) and
  ChampionDetail's fixed-height shifted-window cells. The config alternative
  (`overrides.<Name>.viewport`) is grade-keyed — switching to it invalidates
  those grades, so keep the workarounds unless re-grading anyway.
- ChampionDetail mocks need a 12+ champion cohort (tier badge ranks within
  the cohort — subject-only rows grade D); AugmentsTable tiers are
  per-rarity (a 3-4 augment rarity can never show S); rankForBuild's 20-game
  50% prior can rank hot 3-pick entries above 20-pick ones — keep low-sample
  mock win rates near 50%.
- CDN-image components: use `showName` and data-miss fallbacks ("Item N",
  ringed placeholder slots) so cells stay gradable offline; keep real
  CommunityDragon iconPaths so production captures show real art.
- RarityFilter returns a fragment — the canvas must supply `display:flex`.

## Known render warns

- (retired) icon components RENDER_THIN/BLANK on floor cards — resolved by
  authored previews sizing them explicitly on the dark canvas.
- ChampionDetail: `bad` with `firstErr: TypeError: Failed to fetch` in the
  offline sandbox — its internal `loadItemData()` fetches Data Dragon
  items.json at mount. The page renders complete (item names fall back to
  "Item <id>"); on a networked machine the errors disappear. Triaged
  environmental, not a defect.

## Re-sync risks

- `ds-entry.ts` is hand-curated: a new website/renderer component does NOT
  appear automatically — add it to the entry AND `componentSrcMap`.
- Mock data in `.design-sync/previews/*.tsx` mirrors the live row shapes
  (`ChampionStatRow` with `patch`/`queue_id`, `Filters` with `patches?: Set`).
  If `website/src/lib/api.ts` or `stats.ts` shapes change, previews compile
  but may render wrong — re-check grades after schema changes.
- The compiled Tailwind CSS only contains classes actually used in the two
  app trees + previews; the design agent cannot invent new utility classes.
  Conventions header documents this.
