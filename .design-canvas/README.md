# Design canvas

The artboards behind the shared design system canvas: the eleven tokens, the
primitives, the stat components, the filters and controls, the icon set, the
before/after pairs for the values that had drifted, and where the shared code
lives.

Every value on them is lifted from `src/shared/`, not approximated - the tier
and rarity colours are the exact `oklch()` the built stylesheet emits, so an
artboard shows what actually renders.

## Editing

Each `*.dc.html` is one artboard; `canvas.json` places them. Edit the sources,
then re-seed and republish - the seeded page is a build artifact and is not
committed:

```bash
node <design-skill>/seed-canvas.mjs \
  --template <design-skill>/payload.template.html \
  --out mayhemstats-shared-design-system.html \
  --title "MayhemStats Shared System" \
  --artboard Main.dc.html --artboard Primitives.dc.html \
  --artboard StatComponents.dc.html --artboard Controls.dc.html \
  --artboard Icons.dc.html --artboard Drift.dc.html \
  --artboard Architecture.dc.html \
  --canvas canvas.json
```

A frame in `canvas.json` neither scales nor crops its artboard: content taller
than `h` is clipped with no warning. Three of these were clipping before anyone
looked, so measure rather than estimate - render an artboard and compare
`scrollHeight` against its frame.

## Keeping it honest

These artboards go stale the same way `.design-sync`'s previews did, and
nothing typechecks plain HTML. When a shared component's look changes, update
the artboard that shows it in the same commit.
