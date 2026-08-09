# MayhemStats conventions

Dark-canvas League of Legends stats system (site: mayhemstats.com; desktop app: Mayhem Tracker). No provider or theme wrapper is needed — components are context-free. The shipped stylesheet styles `body` dark (`--color-lol-dark` background, `--color-lol-text` text); build screens on that dark ground, never on white.

## Styling idiom

Tailwind utility classes, but the stylesheet is **statically compiled — only classes already in it exist**. Do not invent arbitrary Tailwind classes (`bg-red-500`, `p-7`, …) — unknown classes silently do nothing. Style your own layout glue with either (a) the theme utility families below, or (b) inline `style` using the token variables. When unsure a utility exists, use the token var inline.

Theme tokens (defined in `styles.css`, usable as `var(--…)` anywhere):
`--color-lol-dark` (page bg) · `--color-lol-card` (panel bg) · `--color-lol-card-hover` · `--color-lol-border` · `--color-lol-gold` (brand accent) · `--color-lol-gold-light` · `--color-lol-win` (green) · `--color-lol-loss` (red) · `--color-lol-text` (muted) · `--color-lol-text-bright`

Utility families known to ship: `bg-lol-dark`, `bg-lol-card`, `bg-lol-card-hover`, `bg-lol-win`, `bg-lol-loss`, `border-lol-border`, `text-lol-gold`, `text-lol-text`, `text-lol-text-bright`, `text-lol-win`, `text-lol-loss`, plus the common structural utilities the components themselves use (`flex`, `grid`, `gap-*`, `px-*`/`py-*`, `rounded-xl`, `text-xs`/`text-sm`, `font-medium`/`font-bold`, `truncate`, `whitespace-nowrap`).

Form controls: use the shipped `.select` and `.input` classes on native `<select>`/`<input>` — they carry the dark card background, border, and gold focus ring.

The house panel pattern: `bg-lol-card rounded-xl border border-lol-border/60` with `p-5`; muted labels are `text-xs text-lol-text uppercase tracking-wider`; gold (`text-lol-gold`) is reserved for interactive/branded accents, green/red strictly for win/loss.

## Where the truth lives

Read `styles.css` (tokens + every existing utility) before styling. Each component's API is its `<Name>.d.ts`; usage patterns are in `<Name>.prompt.md`. Stats semantics: scores are win rates shrunk toward 50% for small samples; entries under 20 games render muted with `*`.

## Idiomatic composition

```tsx
<div style={{ background: "var(--color-lol-dark)", minHeight: "100%", padding: 24 }}>
  <div className="bg-lol-card rounded-xl border border-lol-border/60 p-5">
    <p className="text-xs text-lol-text uppercase tracking-wider mb-2">Top champion</p>
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold text-lol-text-bright">Malzahar</span>
      <TierBadge tier="S+" games={48} />
    </div>
    <div style={{ width: 220, marginTop: 8 }}>
      <WinRateBar wins={33} total={48} />
    </div>
  </div>
</div>
```

Champion/item/augment artwork loads from Riot's Data Dragon and CommunityDragon CDNs at runtime via the icon components (`ChampionIcon championId={101}`, `ItemIcon`, `AugmentIcon` with their data records) — never hand-build icon `<img>` URLs.
