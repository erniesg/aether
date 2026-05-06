---
name: Bug
about: Regression, broken behavior, or wrong output
title: '[bug] '
labels: bug, claude-run, queue-queued
---

## Summary

<One-line description of the wrong behavior. What's broken, who's affected.>

## Reproduction

1. <step 1>
2. <step 2>
3. <step 3 — where the bug appears>

**Expected**: <observable correct outcome>
**Actual**: <observable wrong outcome>

## QA Plan

### Features

- F1 — Restore <correct behavior described above>
  - **Falsifiable**: After the fix, `<exact assertion that today fails>` passes.
  - **Verification**: <test that reproduces the bug, must fail without the fix and pass with it (red→green TDD)>
  - **Proof**: <test id, file:line>

### Critical journeys

- J1 — <Affected journey, if the bug breaks one. Otherwise: "none affected — local bug.">
  - **Steps**: 1. … 2. … 3. …
  - **Falsifiable**: <journey completes with the corrected output>
  - **Verification**: <e2e test path>
  - **Proof**: <video / screenshots>

### Surfaces touched

- **Web**: <route(s), or `none`>
- **API**: <endpoint(s), or `none`>
- **Worker / job / cron**: <name(s), or `none`>

### Proof artifacts required

- [ ] **Failing test** committed first (red), then the fix that turns it green. The reviewer checks commit history for the red→green pair.
- [ ] <other artifact, e.g. screenshot of the corrected UI state>

## Acceptance criteria

- [ ] The bug no longer reproduces by the steps above.
- [ ] A test exists that would have caught this bug, demonstrably failing without the fix.
- [ ] No new regressions in the test suite (`npm test` exits 0).

## Context / references

- First seen: <commit sha or PR# or run url>
- Related issues: <#N or `none`>
- External: <url or `none`>

---

> The reviewer agent enforces [`docs/qa-rubric.md`](../../docs/qa-rubric.md). Bug fixes without a red→green test pair are auto-rejected — the missing test is the first defect.
