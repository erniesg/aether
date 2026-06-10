# Spec 05 evidence

## Commands

- `npx vitest run tests/unit/x-intent-builder.test.ts tests/component/publish-section.test.tsx`
  - Result: exits 0; 2 files passed; 24 tests passed.
- `npx playwright test tests/e2e/publish-draft-queue.spec.ts --trace on --output docs/specs/2026-06-10-social-loop/evidence/05/playwright-output`
  - Result: exits 0; 1 Chromium test passed.
- `npm run typecheck`
  - Result: exits 0.

## Proof artifacts

- Intent URL builder fixtures: `tests/unit/x-intent-builder.test.ts`
  - Covers plain text, emoji, newline, URL-weighted over-length, and reply intent URL fixtures.
- Draft queue component behaviors: `tests/component/publish-section.test.tsx`
  - Covers add, inline edit, reload-equivalent persistence, posted status transition, over-length disable, and permalink capture.
- Playwright popup journey: `tests/e2e/publish-draft-queue.spec.ts`
  - Trace: `docs/specs/2026-06-10-social-loop/evidence/05/playwright-output/e2e-publish-draft-queue-Sp-329a4-d-persists-posted-permalink-chromium/trace.zip`
- Screenshots:
  - Queue with draft: `docs/specs/2026-06-10-social-loop/evidence/05/queue-with-drafts.png`
  - Over-length state: `docs/specs/2026-06-10-social-loop/evidence/05/over-length-state.png`
  - Posted state: `docs/specs/2026-06-10-social-loop/evidence/05/posted-state.png`

## Constraints

- New runtime dependencies: none.
- X credentials: no credential-prefix additions in the spec 05 diff; posting uses `https://x.com/intent/post` links only.
