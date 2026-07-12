---
name: Feature
about: New capability, surface, or behavior
title: '[feature] '
labels: feature
---

## Summary

<One-line description of the change. Keep it user-facing — what changes for the creator using aether.>

## QA Plan

### Features

- F1 — <feature description, single line>
  - **Falsifiable**: <yes/no claim, observable from outside the function>
  - **Verification**: <test id, curl recipe, or "manual: <one-line steps>">
  - **Proof**: <file:line, test id, screenshot path, JSON path, log line, or video timestamp>

### Critical journeys

- J1 — <journey name>
  - **Steps**: 1. … 2. … 3. …
  - **Falsifiable**: <observable end state>
  - **Verification**: <e2e test path or recorded manual procedure>
  - **Proof**: <video, screenshots, convex-snapshot-diff id>

> If this work does not affect a user-visible journey (pure refactor, dependency bump, doc fix), replace this section with `Critical journeys: none affected — this is a <kind> change`. Reviewers must challenge that declaration if the diff touches the creator loop.

### Surfaces touched

- **Web**: <route(s), or `none`>
- **API**: <endpoint(s), or `none`>
- **Worker / job / cron**: <name(s), or `none`>

### Proof artifacts required

- [ ] <artifact 1 — describe and say where it must land (PR description, attached file, log)>
- [ ] <artifact 2>

> Common artifacts: before/after screenshots for visual changes, curl + 200 response for new endpoints, Playwright trace + final screenshot for creator-loop changes, and a `capabilityRun`/entry-ref record for new mutations.

## Acceptance criteria

- [ ] <criterion 1, falsifiable, with proof location>
- [ ] <criterion 2>

## Context / references

- Linked PRs: <#N or `none`>
- Related docs: <path or `none`>
- External: <url or `none`>

---

> Human or Codex reviewers apply [`docs/qa-rubric.md`](../../docs/qa-rubric.md) to the `## QA Plan` above. Replace unfalsifiable phrases such as *should*, *looks good*, or *feels right* with observable outcomes. See [`docs/reviewer-personas.md`](../../docs/reviewer-personas.md) for the risk surfaces to check.
