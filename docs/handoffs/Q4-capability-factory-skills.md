# Handoff — Q4: Capability factory / Skills authoring

**Demo question 4.** "Capability factory — aether builds a new capability when one doesn't exist (or invokes an existing skill)."

## Goal

When a creator asks for something aether doesn't have a capability for, Claude Opus 4.7 (a) checks if any **Skill** matches, (b) invokes that Skill, OR (c) authors a brand-new capability proposal that the human can accept. The result is a new pinned chip on the floating toolbar that re-runs the move on any layer.

The user wants this to use **Anthropic Skills** as a first-class artifact (`SKILL.md` manifests + reference files), not just internal `CapabilityDefinition` rows.

## Current state on `main` (commit `2c7d59ee` on stg)

What works:
- `lib/capability/factory.ts` — `planCapabilityFactoryAction` returns one of `invoke-entry | author-skill | author-workflow | author-tool` based on whether a published skill/workflow/tool matches.
- `lib/capability/factoryRegistry.ts` — registry lookup.
- `lib/capability/authoringIssue.ts` — opens a GitHub-style issue when authoring is required.
- `app/api/capability/factory/route.ts` POST returns the plan.
- Floating toolbar already reserves space for pinned skill chips (`components/canvas/FloatingToolbar.tsx` line 86 — comment refers to "Pinned capability chips lifted into the toolbar via pin-as-capability").

What's missing:
1. **`SKILL.md` manifest format** — name, description, instructions sections, reference files. Adopt Anthropic's conventional `SKILL.md` shape (front-matter + body).
2. **`SkillRef` emission from factory** — when `planCapabilityFactoryAction` returns `author-skill`, we should produce a real `SkillRef` (path to `SKILL.md` + version) alongside the existing `CapabilityEntryRef`.
3. **Live authoring loop** — UI flow that takes the plan, drafts the Skill, surfaces it for human review (Discord), and on approval pins it as a toolbar chip.
4. **Skill invocation tool** — a Claude tool `call_skill({ skillRef, input })` that loads `SKILL.md`, includes its instructions in the system prompt (via prompt caching), and runs the inner workflow.

## Architecture

Per the research agent's adoption plan:
- This is the canonical home for **Skills** (Anthropic feature, not just internal capabilities).
- One Skill per reusable creative move: e.g. `brand-ingest`, `research-cluster`, `smart-text-placement`, `double-exposure`, `kinetic-intro`.
- Skills folder: `lib/agent/skills/<skill-name>/SKILL.md` (+ optional executor `.ts` files).
- Loader: `lib/agent/skills/loader.ts` reads `SKILL.md` front-matter + body, returns `{ name, description, instructions, referenceFiles }`.
- Capability registry mirrors Skills as `CapabilityRegistryEntry` rows so the existing factory plan logic still works; the new branch is "this capability is implemented by a Skill" instead of "this capability is implemented by a tool/workflow".

## Acceptance criteria

Red/green TDD.

1. **`SKILL.md` parser** (`lib/agent/skills/loader.ts`) — reads front-matter (name, version, description, tools[], referenceFiles[]) + body. Tested with a fixture.
2. **`callSkill` tool** wrapping `runtimeForSkill(skillRef, input)` — given a SkillRef, loads, runs, returns structured output.
3. **Factory emits `SkillRef`** — when `action: 'author-skill'`, the response includes a draft `SkillRef` with the `SKILL.md` content the creator can review.
4. **One reference Skill ships**: `brand-ingest` Skill with a `SKILL.md` + executor that calls the existing `lib/brand/ingest.ts` flow. This proves the pattern.
5. **One factory-authored Skill ships end-to-end**: creator asks for "neon drench with ambient wash"; factory plans `author-skill`; Claude drafts `lib/agent/skills/neon-drench-ambient-wash/SKILL.md`; UI shows the draft for accept/reject; on accept, chip appears in floating toolbar.
6. **E2E**: `tests/e2e/capability-factory-skill-authoring.spec.ts` covers the full loop.

## Files to read

- `AGENTS.md`, `CLAUDE.md`
- `lib/capability/factory.ts`, `lib/capability/factoryRegistry.ts`, `lib/capability/authoringIssue.ts`, `lib/capability/types.ts`
- `app/api/capability/factory/route.ts`
- `components/canvas/FloatingToolbar.tsx` (where pinned chips would mount)
- Anthropic article: https://claude.com/blog/building-agents-with-skills-equipping-agents-for-specialized-work
- Anthropic article: https://claude.com/blog/skills-explained
- The research agent's adoption plan (in this conversation thread, summary in §4)

## Architectural blockers (per research)

These need to be addressed early in this slice:

- Convex needs a `skill` table to mirror authored Skills as a graph artifact.
- Wire prompt caching on the `call_skill` system prompt.
- Decide where Skill files live: filesystem under `lib/agent/skills/` vs Convex blob storage. Filesystem is fine for the hackathon.

## Validation path

```bash
npm test                                       # full suite incl. new tests
npm run typecheck
PORT=3107 npx playwright test tests/e2e/capability-factory-skill-authoring.spec.ts
npm run cf-build
```

## Out of scope

- Skill marketplace / team library.
- Cross-workspace Skill sharing.
- Anthropic Managed Agents sessions (research agent recommended deferring this — adopt only if Q1 + Q2 prove it's needed).

## Commit conventions

Same as Q3 handoff: `Co-Authored-By: Claude Opus 4.7 (1M context)`, conventional-commit prefixes, no force-push to main.
