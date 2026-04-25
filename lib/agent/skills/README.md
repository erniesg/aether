# lib/agent/skills — Skills foundation

## What shipped in PR #119 (AC1–AC4 + schema)

| AC | Description | File(s) |
|---|---|---|
| AC1 | `loader.ts` parses `SKILL.md` front-matter and returns a `SkillManifest` | `loader.ts`, `loader.test.ts` |
| AC2 | `callSkill.ts` assembles the system prompt with `cache_control: ephemeral` + structured output | `callSkill.ts`, `callSkill.test.ts` |
| AC3 | `lib/capability/factory.ts` emits `draftSkillRef` on `author-skill` plans | `../../capability/factory.ts`, `../../capability/factory.test.ts` |
| AC4 | `brand-ingest/` skill ships end-to-end: loader reads SKILL.md, executor delegates to `lib/brand/ingest.ts` | `brand-ingest/` |
| schema | `convex/schema.ts` has a `skill` table (`name`, `version`, `description`, `manifestPath`, `referenceFilePaths`, `createdAt`) indexed `by_name` and `by_name_version` | `convex/schema.ts` |

**AC5 (factory-driven Skill authoring loop) and AC6 (e2e Playwright spec) are deferred to a follow-up issue.**
See the linked issue for the full spec.

## Deferred: AC5 and AC6

AC5 covers the full factory-authored Skill flow: Claude drafts `SKILL.md` from a natural-language description, the creator sees a UI accept/reject modal, and the accepted skill is pinned as a toolbar chip.

AC6 is the Playwright e2e test exercising the complete AC5 flow.

These were intentionally excluded from PR #119 to keep the PR reviewable in scope. They will land in the follow-up issue referenced in the PR body.

## Path conventions for referenceFiles

`referenceFiles` paths in a `SKILL.md` front-matter are resolved **relative to the skill directory** (i.e. the directory containing that `SKILL.md`).

```
referenceFiles:
  - notes.md           # resolved as <skillDir>/notes.md
  - examples/foo.json  # resolved as <skillDir>/examples/foo.json
```

For types or utilities that live elsewhere in the repo, copy the relevant section into a `.snippet.ts` file inside the skill dir rather than referencing a repo-absolute path. This keeps skills portable and avoids implicit cross-skill dependencies.

The `brand-ingest` skill currently lists `lib/brand/types.ts` as a reference file. That entry will be converted to `types.snippet.ts` in the follow-up issue.

## Tool wiring

`SkillManifest.tools` is a **declarative list of tool names** that the skill may call. At runtime, the caller is responsible for resolving these names to `Anthropic.Tool` objects and passing them to `callSkill` via the `toolRegistry` parameter.

If `toolRegistry` is not provided and `manifest.tools` is non-empty, `callSkill` throws a descriptive error rather than silently ignoring the declared tools.

## File layout

```
lib/agent/skills/
  README.md           (this file)
  types.ts            SkillManifest, SkillRef, SkillRuntimeInput, SkillRuntimeOutput
  loader.ts           loadSkillManifest(skillDir) → SkillManifest
  callSkill.ts        callSkill({ skillRef, input, model?, toolRegistry? })
  loader.test.ts
  callSkill.test.ts
  brand-ingest/
    SKILL.md
    executor.ts
    executor.test.ts
  __fixtures__/
    sample-skill/SKILL.md
    malformed-skill/SKILL.md
```
