# lib/agent/skills — Skills foundation

## What shipped

| AC | Description | File(s) |
|---|---|---|
| AC1 | `loader.ts` parses `SKILL.md` front-matter and returns a `SkillManifest` | `loader.ts`, `loader.test.ts` |
| AC2 | `callSkill.ts` assembles the system prompt with `cache_control: ephemeral` + structured output | `callSkill.ts`, `callSkill.test.ts` |
| AC3 | `lib/capability/factory.ts` emits `draftSkillRef` on `author-skill` plans | `../../capability/factory.ts`, `../../capability/factory.test.ts` |
| AC4 | `brand-ingest/` skill ships end-to-end: loader reads SKILL.md, executor delegates to `lib/brand/ingest.ts` | `brand-ingest/` |
| AC5 | Claude drafts `SKILL.md` from a creator prompt, accept/reject modal pins the skill as a toolbar chip, persists to disk + Convex | `draftManifest.ts`, `persistManifest.ts`, `../../../components/capability/SkillAcceptDialog.tsx`, `../../../app/api/capability/{draft-skill,accept-skill}/route.ts`, `../../../app/api/skill/run/route.ts` |
| AC6 | Playwright e2e covering author-skill prompt → draft → accept → chip → rerun | `../../../tests/e2e/skill-author.spec.ts` |
| schema | `convex/schema.ts` has a `skill` table (`name`, `version`, `description`, `manifestPath`, `referenceFilePaths`, `createdAt`) indexed `by_name` and `by_name_version`; `convex/skills.ts` provides `list`, `getByName`, `insert` | `convex/schema.ts`, `convex/skills.ts` |

## AC5 — authoring loop at runtime

```
creator types  ──►  resolveCapabilityRequest detects "write a skill that …"
   │                returns { kind: 'author-skill', authoringPrompt }
   ▼
WorkspaceShell  ──►  setPendingSkillPrompt(prompt)
   │                  └──►  SkillAcceptDialog opens
   ▼
SkillAcceptDialog ─► POST /api/capability/draft-skill
                     └──► draftSkillManifest() (Claude tool-use)
                          └──► returns SkillManifest
   │
   ▼ creator accepts
WorkspaceShell  ──►  POST /api/capability/accept-skill
                     ├──► persistDraftSkill writes lib/agent/skills/<name>/SKILL.md
                     └──► recordSkillInsert (best-effort Convex insert)
   │
   ▼
addDefinition({ tool: 'skill', entryRef: { kind: 'skill', ... }, … })
   │
   ▼ in-memory store fires the existing pinnedCapabilities pipe
FloatingToolbar renders the pinned chip; clicking it fires
POST /api/skill/run → callSkill → SkillRuntimeOutput.
```

When `?bypass=1` is in the URL, the dialog requests a deterministic local draft
(no Anthropic key needed) and the chip-press request runs in bypass mode.

## Path conventions for referenceFiles

`referenceFiles` paths in a `SKILL.md` front-matter are resolved **relative to the skill directory** (i.e. the directory containing that `SKILL.md`).

```
referenceFiles:
  - notes.md           # resolved as <skillDir>/notes.md
  - examples/foo.json  # resolved as <skillDir>/examples/foo.json
```

For types or utilities that live elsewhere in the repo, copy the relevant section into a `.snippet.ts` file inside the skill dir rather than referencing a repo-absolute path. This keeps skills portable and avoids implicit cross-skill dependencies.

The `brand-ingest` skill ships a `types.snippet.ts` mirroring the relevant `lib/brand/types.ts` shape so the skill stays portable.

## Tool wiring

`SkillManifest.tools` is a **declarative list of tool names** that the skill may call. At runtime, the caller is responsible for resolving these names to `Anthropic.Tool` objects and passing them to `callSkill` via the `toolRegistry` parameter.

If `toolRegistry` is not provided and `manifest.tools` is non-empty, `callSkill` throws a descriptive error rather than silently ignoring the declared tools.

## File layout

```
lib/agent/skills/
  README.md             (this file)
  types.ts              SkillManifest, SkillRef, SkillRuntimeInput, SkillRuntimeOutput
  loader.ts             loadSkillManifest(skillDir) → SkillManifest
  callSkill.ts          callSkill({ skillRef, input, model?, toolRegistry? })
  draftManifest.ts      draftSkillManifest({ prompt, bypassAgent? }) — AC5 step 1
  persistManifest.ts    persistDraftSkill({ manifest }) → writes SKILL.md to disk
  loader.test.ts
  callSkill.test.ts
  draftManifest.test.ts
  persistManifest.test.ts
  brand-ingest/
    SKILL.md
    executor.ts
    executor.test.ts
    types.snippet.ts
  __fixtures__/
    sample-skill/SKILL.md
    malformed-skill/SKILL.md
```
