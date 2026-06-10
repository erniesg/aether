# Spec 08 evidence

## Protocol note

The initial 08 implementation existed before this review lap, so its original
red/green commit sequence cannot be reconstructed honestly. This refresh adds
the missing live receipts loop proof and local demo queue fallback, then records
the rerunnable route/component/e2e evidence.

## Commands

```text
npx vitest run tests/unit/api-presence-drafts.test.ts tests/unit/convex-publish-generated-drafts.test.ts tests/component/presence-section.test.tsx tests/component/publish-section.test.tsx

Test Files  4 passed
Tests       17 passed
```

```text
npx playwright test tests/e2e/presence-draft-generation.spec.ts

1 passed
```

2026-06-10 VM rerun with trace evidence:

```text
npx playwright test tests/e2e/presence-draft-generation.spec.ts --trace on --output docs/specs/2026-06-10-social-loop/evidence/08/playwright-output

1 passed
```

```text
npm run typecheck
> tsc --noEmit
exit 0
```

2026-06-10 combined social-presence gate:

```text
npx vitest run lib/research/repo-facts.test.ts lib/research/evidence-facts.test.ts lib/providers/enrichment/context-dev.contract.test.ts tests/unit/convex-evidence-facts.test.ts tests/unit/api-evidence-ingest.test.ts tests/component/brand-section.test.tsx tests/unit/presence-handle.test.ts tests/unit/api-presence-strategy.test.ts tests/unit/convex-presence.test.ts tests/component/presence-section.test.tsx tests/unit/account-analysis.test.ts tests/unit/convex-presence-insights.test.ts tests/unit/api-presence-insights.test.ts tests/unit/api-presence-insights-lap.test.ts tests/unit/api-presence-drafts.test.ts tests/unit/convex-publish-generated-drafts.test.ts tests/component/publish-section.test.tsx tests/component/left-rail.sections.test.tsx

Test Files  18 passed (18)
Tests       76 passed (76)
```

## Proof ids

- Route accepts only pillar-matching, receipt-grounded drafts and rejects
  overweight or non-strategy-pillar drafts into `rejected[]`:
  `tests/unit/api-presence-drafts.test.ts:66`.
- Prompt always includes pillars and draft-shape rules:
  `tests/unit/api-presence-drafts.test.ts:157`.
- Bare prompt omits facts cleanly:
  `tests/unit/api-presence-drafts.test.ts:164`.
- Server-side productFact loading when UI omits evidence facts:
  `tests/unit/api-presence-drafts.test.ts:203`.
- Duplicate `lapId` idempotency in queue persistence:
  `tests/unit/convex-publish-generated-drafts.test.ts:40`.
- Rail generate action disabled until accepted strategy, then returns
  `n posts · m replies`, sends a stable lap id, and writes local demo queue
  rows with receipts: `tests/component/presence-section.test.tsx:161`.
- Generated rows render like spec-05 queue rows with receipt metadata and
  enabled intent gate: `tests/component/publish-section.test.tsx:371`.
- End-to-end queue journey and exact X intent URL:
  `tests/e2e/presence-draft-generation.spec.ts:89`.

## Prompt proof

Captured prompt assertions prove these literal blocks:

- `Strategy pillars:`
- `agent harnesses`
- `Numbers are never invented`
- `Evidence facts:` when product facts exist
- no `Evidence facts:` block when none exist

The persisted productFact load path is covered by
`tests/unit/api-presence-drafts.test.ts:203`, which sends only
`{ workspaceId, profile, strategy }`, mocks Convex `productFact` rows, and
asserts the draft prompt contains the stored claim and `repo:` ref.

## Idempotency proof

`tests/unit/convex-publish-generated-drafts.test.ts:40` invokes the generated
batch persistence twice with the same `profileId` and `lapId`:

```json
{
  "firstRun": { "created": 2, "skipped": 0 },
  "secondRun": { "created": 0, "skipped": 2 },
  "finalRowCount": 2
}
```

The UI uses a stable lap id of `presence_${profile.id}_${strategy.id}`; proof:
`tests/component/presence-section.test.tsx:237` and
`tests/e2e/presence-draft-generation.spec.ts:52`.

## No posted transition proof

```text
rg -n "markDraftPosted|markPosted" app/api/presence/drafts lib/presence components/rail/sections/PresenceSection.tsx || true

(no matches)
```

The shared spec-05 queue still owns the intent confirmation transition.
Generation only creates `draft` rows.

## Media proof

- `docs/specs/2026-06-10-social-loop/evidence/08/generated-drafts-queue.png`
  - route/surface: presence section + scheduled/publish rail on
    `/workspace/presence-08`
  - interaction: add profile, accept strategy, generate drafts, open queue
  - result: post and reply drafts render with pillar `agent harnesses`,
    receipt refs, and an exact X intent link
- Trace: `docs/specs/2026-06-10-social-loop/evidence/08/playwright-output/e2e-presence-draft-generat-c0926-preserves-the-X-intent-gate-chromium/trace.zip`

## Dependency note

No new runtime dependencies were added.
