# Issue: Canvas Chrome Hierarchy

## Problem

tldraw's native `Toolbar` and `StylePanel` were visually colliding with the aether rails, especially the right-rail flyouts. The result felt like two apps layered on top of each other.

## Decision

- Hide tldraw `Toolbar` and `StylePanel` through component overrides.
- Keep tldraw engine behavior, context menu, and keyboard shortcuts.
- Move a small primitive + style subset into the aether floating toolbar so creators still have immediate access to core canvas actions without reviving the overlap.

## Acceptance

- No native tldraw toolbar or style panel overlaps the rails.
- The floating toolbar exposes a minimal subset for select, hand, text, shape, arrow, ink/accent color, and solid/none fill.
- Right-rail flyouts open cleanly without competing chrome.

## Status

- Shipped in this branch.
