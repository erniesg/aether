# Spec 05 review — draft queue with edit/confirm via X web intents

Verdict: **APPROVED**
Branch: `codex/social-05-draft-queue` (6 commits, claim → red → green → e2e → evidence → review flip)
Reviewer reran every gate independently; nothing taken from notes.md on trust.

## Acceptance criteria

- [x] **Intent URLs exact-match fixtures incl. emoji/newline/reply encoding** —
  `tests/unit/x-intent-builder.test.ts > "builds exact web intent URL"` asserts
  literal expected hrefs (not builder-derived) for plain/emoji/newline/over-length/reply;
  lengths hand-computed (258 + 1 + 23 = 282 for the URL-weighted fixture).
  Reviewer run: 24/24 pass.
- [x] **Drafts and status transitions survive reload** —
  `tests/component/publish-section.test.tsx` (add → edit → re-render, posted transition);
  e2e reload assertions at `tests/e2e/publish-draft-queue.spec.ts:84-91`.
  Screenshots: `queue-with-drafts.png`, `posted-state.png` (visually verified).
- [x] **Over-length drafts cannot be confirmed** — e2e asserts `281/280` count and
  `aria-disabled="true"` on the confirm anchor (`publish-draft-queue.spec.ts:69-77`);
  `over-length-state.png`. Anchor uses `pointer-events-none` + `preventDefault` guard
  (`components/rail/sections/PublishSection.tsx` DraftRow).
- [x] **No X credentials anywhere** — reviewer grep of the full branch diff for
  `TWITTER_|X_API|API_KEY|SECRET|TOKEN`: zero hits. Flow is
  `https://x.com/intent/post` links only; e2e stubs `x.com/**` routes so even
  tests touch no real X surface.

## Gates (reviewer-run)

- `npx vitest run tests/unit/x-intent-builder.test.ts tests/component/publish-section.test.tsx` → 24 passed
- `npm run typecheck` → clean
- `npx playwright test tests/e2e/publish-draft-queue.spec.ts` → 1 passed (1.1m); popup URL
  asserted via `context.waitForEvent('page')` exactly as specced
- Full suite `npm test` → 1818 passed, 1 skipped — no regressions

## Code notes

- `lib/publish/draft-store.ts` mirrors the references-store pattern faithfully
  (Convex via anyApi + localStorage fallback, `useSyncExternalStore` with cached
  per-workspace snapshots — avoids the getSnapshot-loop pitfall).
- `convex/schema.ts` addition is additive, indexed `by_workspace`, documented as
  deliberately separate from `scheduledPost`.
- UI follows taxonomy/restraint: chips for kind/pillar/count/status, one hint line
  empty state, no new panels.

## Non-blocking observations (future tightening, not spec 05 scope)

1. `getXWeightedLength` counts code points as 1; X weights most emoji/CJK as 2.
   The spec only required URL weighting (23), so in-spec — but a 140×-emoji draft
   would show confirmable while X rejects it. Candidate follow-up for spec 06/07 era.
2. Confirm marks `posted` on intent-open, before the human actually posts in the
   composer — inherent to web intents and per spec; the permalink paste is the
   ground-truth signal, which spec 06's join already treats as authoritative.
