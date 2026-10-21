# CSS maintenance audit — 2026-10-21

## Scope

The three stylesheets are intentionally layered in this order:

1. \`app.css\` — base layout and primary theme.
2. \`sithari.css\` — Sith'ari-specific visual rules.
3. \`holocron-system.css\` — shared experience and page-level refinements.

This pass removed only selector branches tied to legacy navigation/pyramid classes that have no references in the current HTML or JavaScript. Responsive overrides and repeated selectors with active references were left intact. No business logic or active Sith’ari selectors were changed.

## Measured baseline

A simple static selector scan (including selectors inside media queries and keyframes) produced this baseline:

| File | Approx. size | Selector blocks | Extra repeated-selector occurrences |
|---|---:|---:|---:|
| \`app.css\` | 250 KB | 2,258 | 693 |
| \`holocron-system.css\` | 120 KB | 839 | 285 |
| \`sithari.css\` | 107 KB | 771 | 311 |

These are maintenance indicators, not a count of confirmed defects. In particular, \`50%\`, \`to\`, and repeated responsive selectors can be legitimate.

## Guardrails added

- CI now fails if this repeated-selector baseline grows.
- Unreferenced legacy pyramid/path selector branches were removed from `app.css` and `holocron-system.css`; active selectors and stylesheet load order were preserved.
- CI verifies that the three visual layers stay in the intended load order.
- A Playwright browser smoke test exercises navigation and checks that forge/Sith'ari equipment grids cannot display more than one mod per physical slot.
- The follow-up CSS refactor should merge only rules whose media/supports/keyframe context and cascade behavior have been verified in a browser.

## Deferred visual validation

The current CI smoke test does not provide pixel-perfect visual snapshots. A full cascade consolidation should follow once desktop and mobile reference screenshots are captured for Sanctuaire, Codex, Seigneur Sith and Sith'ari. This avoids an unverified visual regression during a maintenance-only release.
