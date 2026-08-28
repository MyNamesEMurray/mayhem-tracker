# MayhemStats conventions

Dark-canvas League of Legends stats system (site: mayhemstats.com; desktop app: Mayhem Tracker). Most components are context-free; the exception is anything drawing an augment, which reads names and rarities from `GameDataProvider` - wrap those screens in one and hand it an augment record. The shipped stylesheet styles `body` dark (`--color-lol-dark` background, `--color-lol-text` text); build screens on that dark ground, never on white.

## Styling idiom

Tailwind utility classes, but the stylesheet is **statically compiled - only classes already in it exist**. Do not invent arbitrary Tailwind classes (`bg-red-500`, `p-7`, …) - unknown classes silently do nothing. Style your own layout glue with either (a) the theme utility families below, or (b) inline `style` using the token variables. When unsure a utility exists, use the token var inline.

Theme tokens (defined in `styles.css`, usable as `var(--…)` anywhere):
`--color-lol-dark` (page bg) · `--color-lol-card` (panel bg) · `--color-lol-card-hover` · `--color-lol-border` · `--color-lol-gold` (brand accent) · `--color-lol-gold-light` · `--color-lol-win` (green) · `--color-lol-loss` (red) · `--color-lol-text` (muted) · `--color-lol-text-bright`

Utility families known to ship: `bg-lol-dark`, `bg-lol-card`, `bg-lol-card-hover`, `bg-lol-win`, `bg-lol-loss`, `border-lol-border`, `text-lol-gold`, `text-lol-text`, `text-lol-text-bright`, `text-lol-win`, `text-lol-loss`, plus the common structural utilities the components themselves use (`flex`, `grid`, `gap-*`, `px-*`/`py-*`, `rounded-xl`, `text-xs`/`text-sm`, `font-medium`/`font-bold`, `truncate`, `whitespace-nowrap`).

Form controls: use the shipped `.select` and `.input` classes on native `<select>`/`<input>` - they carry the dark card background, border, and gold focus ring.

The house furniture is exported rather than described, so reach for it instead of rebuilding it:

- `Panel` - the card surface. `bg-lol-card rounded-xl border border-lol-border/60`, plus whatever padding the content wants (`p-4` for a stat block, `p-5` for a section, `overflow-hidden` for a table). The bare class string is exported as `PANEL` for elements that are not a `div`.
- `LABEL` - the muted heading above a panel or a stat: `text-[11px] font-medium uppercase tracking-[.08em] text-lol-text`.
- `StatTile` - one number with its name above it and an optional line below.
- `Button` - the gold call to action, in `sm`/`md`/`lg`. `tone="plain"` is the quieter one that sits beside it. For an anchor styled as a button, `buttonClass(tone, size)` returns the same classes.

Gold (`text-lol-gold`) is reserved for interactive and branded accents. Green and red are strictly win and loss. Performance - a KDA ratio, a 1-10 match score - uses its own ramp: amber, then sky, then emerald, then muted.

## Where the truth lives

Read `styles.css` (tokens + every existing utility) before styling. Each component's API is its `<Name>.d.ts`; usage patterns are in `<Name>.prompt.md`. Stats semantics: Score is the lower bound of a 95% Wilson interval on the win rate - read it as the rate the record supports, so it climbs with sample size rather than starting high and sliding down. A perfect 5-0 scores 56.6. Tiers are percentile ranks within a cohort, which means a cohort of fewer than twenty entries has no S+ at all. Entries under 20 games render muted with `*`.

## Idiomatic composition

```tsx
<div style={{ background: "var(--color-lol-dark)", minHeight: "100%", padding: 24 }}>
  <Panel className="p-5">
    <p className={`${LABEL} mb-2`}>Top champion</p>
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold text-lol-text-bright">Malzahar</span>
      <TierBadge tier="S+" games={48} />
    </div>
    <div style={{ width: 220, marginTop: 8 }}>
      <WinRateBar wins={33} total={48} />
    </div>
  </Panel>
</div>
```

Champion, item and augment artwork loads from Riot's Data Dragon and CommunityDragon CDNs at runtime through the icon components - never hand-build an icon `<img>` URL.

- `ChampionIcon championId={101}` - needs nothing else.
- `AugmentIcon augmentId={54} showName` - reads the augment from `GameDataProvider`.
- `ItemIcon itemId={3089} iconPath="…" name="…"` - takes a resolved item rather than a lookup table, because the app resolves against the patch a game was played on and the site against the latest. Without an `iconPath` it falls through to a placeholder that holds its space.
