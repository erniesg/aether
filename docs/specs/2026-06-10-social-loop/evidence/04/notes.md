# Spec 04 evidence

## Protocol note

The initial 04 implementation was already present in the working tree before
this review lap, so its original red/green commit trail cannot be reconstructed
honestly. This evidence records the rerunnable proof for the current
implementation plus the review fixes: persisted evidence facts are loaded into
the planner prompt, brand/offer/campaign context is included, and fallback
responses are surfaced in the rail.

## Commands

```text
npx vitest run tests/unit/presence-handle.test.ts tests/unit/api-presence-strategy.test.ts tests/unit/convex-presence.test.ts tests/component/presence-section.test.tsx tests/component/left-rail.sections.test.tsx

Test Files  5 passed
Tests       29 passed
```

```text
npx playwright test tests/e2e/presence-strategy.spec.ts

1 passed
```

```text
npm run typecheck
> tsc --noEmit
exit 0
```

## Proof ids

- Handle normalization and profile persistence: `tests/component/presence-section.test.tsx:23`.
- Complete strategy shape and exemplar reasoning prompt block:
  `tests/unit/api-presence-strategy.test.ts:46`.
- Graceful no-evidence fallback with non-follower metric:
  `tests/unit/api-presence-strategy.test.ts:145`.
- Convex proposal persistence: `tests/unit/api-presence-strategy.test.ts:172`.
- Product facts loaded server-side when the UI sends only workspace/profile:
  `tests/unit/api-presence-strategy.test.ts:210`.
- Brand/offer/campaign prompt context: `tests/unit/api-presence-strategy.test.ts:276`.
- ICP digest prompt inclusion: `tests/unit/api-presence-strategy.test.ts:345`.
- Profile-scoped accept: `tests/component/presence-section.test.tsx:47`.
- J1 reload journey: `tests/e2e/presence-strategy.spec.ts:82`.

## JSON proof

The mocked strategy response in `tests/unit/api-presence-strategy.test.ts:46`
contains:

```json
{
  "positioning": "I ship visible AI agents and the harnesses that keep them accountable.",
  "icpAccounts": [
    { "handle": "@openai", "reason": "platform builders reshare credible demos" },
    { "handle": "@AnthropicAI", "reason": "agent reliability audience" },
    { "handle": "@modal_labs", "reason": "infra-heavy AI deployment lane" },
    { "handle": "@vercel", "reason": "DX audience for builders" },
    { "handle": "@convex_dev", "reason": "reactive app builders match receipts" }
  ],
  "pillars": [
    {
      "name": "agent harnesses",
      "evidenceRefs": ["repo:https://github.com/erniesg/aether"],
      "exampleFormats": ["failure-honest thread"]
    },
    {
      "name": "visible demos",
      "evidenceRefs": ["site:https://ernie.sg"],
      "exampleFormats": ["demo video post"]
    },
    {
      "name": "production rigor",
      "evidenceRefs": ["resume:resume.md"],
      "exampleFormats": ["earned opinion"]
    }
  ],
  "cadence": "2 posts/week · 15 min replies/day",
  "replyPlaybook": { "dailyMinutes": 15, "accountListSize": 25 },
  "skipList": ["model hot takes", "generic launch commentary"],
  "goalMetric90d": "5 replies or DMs from named lab/tooling engineers referencing specific posts"
}
```

Captured prompt assertions prove these literal blocks:

- `Reframe the goal as evidence, not audience`
- `ICP in priority order, with a reason each`
- `Evidence facts:`
- `Creator context:`
- `ICP insights digest:`

## Media proof

- `docs/specs/2026-06-10-social-loop/evidence/04/two-profiles-accepted.png`
  - route/surface: presence left-rail section on `/workspace/presence-04`
  - interaction: add personal/product profiles, propose both, accept personal
  - result: personal shows `accepted · 3 pillars`, product remains `proposed`
- `docs/specs/2026-06-10-social-loop/evidence/04/after-reload.png`
  - interaction: reload, reopen presence section
  - result: normalized handles and independent strategy statuses persist

## Convex row proof

`tests/unit/convex-presence.test.ts` proves profile-scoped strategy state:
adding two profiles stores separate profile rows, and accepting one strategy
does not change the sibling proposal.

## Dependency note

No new runtime dependencies were added.
