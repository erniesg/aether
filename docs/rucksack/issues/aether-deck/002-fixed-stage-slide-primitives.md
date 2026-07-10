# Fixed-Stage Slide Primitives

provider: vm-codex
depends-on: 001

## Goal

Create reusable Aether deck primitives for a fixed 16:9 stage, slide shell, navigation controls, style tokens, layout blocks, and verification hooks. These primitives should support generated deck artifacts and hand-authored fixtures inside the existing creator shell.

Use `frontend-slides` as the reference constraint: slides are authored on a 1920x1080 stage and the whole stage scales uniformly to the viewport. Implement this as Aether-native React/TypeScript, not as a copied single-file HTML generator.

## Acceptance tests

- Add reusable deck primitives under the existing component/lib conventions.
- The stage renders a 1920x1080 internal canvas scaled as a whole to fit the viewport.
- Slides never reflow per mobile viewport; the stage letterboxes or pillarboxes instead.
- Slide visibility uses opacity/visibility/pointer-events, not display toggling that can be overridden by layout classes.
- Navigation supports arrow keys, space/page keys, wheel, touch swipe, and URL-addressable slide state.
- Navigation and slide state leave room for HyperFrames-style fragments, hotspots, speaker notes, and presenter mode without requiring those features to be fully implemented in this primitive slice.
- Reduced-motion mode disables or simplifies nonessential slide animation.
- Provide base slide shells for title, section, split proof, diagram, live demo, code reference, metric strip, and closing slides.
- Primitives use Aether creator vocabulary and respect taxonomy boundaries: slide content is output, controls are navigation/tool, provenance is metadata.
- The primitives can render inside the same workspace shell without adding a generic builder/inspector/run-stack layout.
- Add component tests for scaling, navigation, inactive-slide interactivity, and reduced motion.

## Validation command

```bash
npm run typecheck
npm test
```

If repo-wide Vitest has unrelated baseline failures, run the touched deck component tests plus one existing workspace/component test and report the boundary.

## Allowed secrets

None.

## Artifact outputs

- Deck primitive source files.
- Component tests for fixed-stage scaling, navigation, inactive slides, and reduced motion.
- Optional screenshot evidence from a desktop and phone viewport if browser tools are available.

## Stop conditions

Stop before adding a new app route, replacing the workspace shell, importing a full presentation framework, or making responsive slide layouts that rearrange content by viewport.

## Human clarification protocol

Ask only if local component conventions make the module boundary genuinely ambiguous. Prefer a small module that can be used by later live-demo and fixture issues.

## Recommended response

Report the primitive names, the fixed-stage behavior, the navigation behaviors tested, and any remaining screenshot/manual validation needed.

## Trade-offs

Fixed 16:9 stage behavior may letterbox on phones, but it preserves presentation layout and makes export/screenshot proof reliable. Responsive reflow would make a deck harder to verify.

## Free-form response

The important `frontend-slides` rules to preserve are 1920x1080 authoring, uniform scaling, no per-device slide reflow, visibility-based slide switching, reduced-motion support, and screenshot verification after changes. Keep the primitive model compatible with HyperFrames `/slideshow` concepts: fragments, hotspots, presenter mode, and speaker notes.
