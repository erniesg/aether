---
name: Feature
about: New capability, surface, or behavior
title: '[feature] '
labels: feature, claude-run
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

> If this PR doesn't affect any user-visible journey (pure refactor, dependency bump, doc fix), replace this section with `Critical journeys: none affected — this is a <kind> change`. The reviewer will reject that declaration if the diff touches files in the demo path.

### Surfaces touched

- **Web**: <route(s), or `none`>
- **API**: <endpoint(s), or `none`>
- **Worker / job / cron**: <name(s), or `none`>

### Proof artifacts required

- [ ] <artifact 1 — describe and say where it must land (PR description, attached file, log)>
- [ ] <artifact 2>

> Common artifacts: before/after screenshots for visual changes, curl + 200 response for new endpoints, Playwright trace + final screenshot for demo-arc changes, ToolRef/SkillRef record dump for new mutations.

## Acceptance criteria

- [ ] <criterion 1, falsifiable, with proof location>
- [ ] <criterion 2>

## Context / references

- Linked PRs: <#N or `none`>
- Related docs: <path or `none`>
- External: <url or `none`>

---

> The reviewer agent enforces [`docs/qa-rubric.md`](../../docs/qa-rubric.md) against the `## QA Plan` section above. Phrases like *should*, *looks good*, *feels right*, or *manual review* are auto-rejected as unfalsifiable. See [`docs/reviewer-personas.md`](../../docs/reviewer-personas.md) for which assertions fire for which touched paths.
