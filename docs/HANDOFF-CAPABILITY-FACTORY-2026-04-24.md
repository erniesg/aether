# Handoff — Capability Factory

Date: 2026-04-24
Branch: `phase/39-capability-factory-foundation`
Worktree: `/Users/erniesg/code/erniesg/aether-capability-factory-foundation`
Planning spike: `/Users/erniesg/code/erniesg/aether-design-capability-factory`

## Current state

- Issue `#39` tracks the capability factory foundation.
- Issue `#40` tracks Discord human-review routing.
- Issue `#41` tracks the first spatial proving seam: image to particles / gaussian splat style output.
- Label `route-human` now exists in the repo.
- A GitHub workflow exists at `.github/workflows/route-human-review.yml`.
- The workflow sends Discord review notifications using:
  - `DISCORD_WEBHOOK_URL` or `DISCORD_WEBHOOK`, if present
  - otherwise `DISCORD_BOT_TOKEN` plus fixed channel id `1496938045876731955`

## Landed in this branch

- `lib/capability/factory.ts`
  - pure planner for:
    - `invoke-entry`
    - `author-skill`
    - `author-tool`
  - marks team publication and new primitives as `route-human`
- `lib/review/discordHumanReview.ts`
  - message builder
  - delivery resolver for webhook or bot+channel routing
- `.github/scripts/notify-discord-human-review.mjs`
  - GitHub Actions sender for Discord review routing
- `.github/workflows/route-human-review.yml`
  - sends notification when issue or PR is labeled `route-human`
- `docs/progress/feat-capability-factory-foundation.md`
  - branch-level notes and next-step summary

## Verification run here

Because this worktree does not keep its own installed dependencies, verification was run with a temporary symlink to the main repo's `node_modules`, then cleaned up.

Verified:

- `npm test -- tests/unit/capability-factory.test.ts tests/unit/discord-human-review.test.ts`
- `npm run typecheck`

## Important repo context

- Main repo path: `/Users/erniesg/code/erniesg/aether`
- Main repo currently has unrelated in-progress segmentation changes. Do not use it for this slice.
- Use the dedicated worktree above.
- Product guardrails are in:
  - `AGENTS.md`
  - `CLAUDE.md`
- Capability-factory architecture note is in:
  - `/Users/erniesg/code/erniesg/aether-design-capability-factory/docs/decisions/2026-04-24-capability-factory.md`

## What is next

### Immediate next implementation slice

Move from the pure planner to actual typed registry wiring:

1. extend `lib/capability/types.ts` so capability definitions can point at a typed `entryRef`
2. add registry modules for:
   - `tool`
   - `workflow`
   - `skill`
3. thread `entryRef` and `version` into capability rerun and provenance
4. preserve current image-gen reruns while adding the stronger shape

### After that

Start issue `#41`:

1. add a new non-image artifact seam, likely `lib/providers/spatial/*`
2. define request/result types for image -> particles / gaussian splat
3. add one draft workflow or skill on top
4. keep it artifact-first and provider-agnostic

## Discord setup assumptions

This branch is ready to route human review to Discord channel `1496938045876731955`, but it still requires one of these in GitHub secrets:

- `DISCORD_WEBHOOK_URL`
- `DISCORD_WEBHOOK`
- or `DISCORD_BOT_TOKEN`

If `DISCORD_BOT_TOKEN` is present, the workflow will send directly to channel `1496938045876731955`.

## Fresh prompt for the next agent

```text
You are continuing the aether capability-factory setup.

Read first:
1. /Users/erniesg/code/erniesg/aether/AGENTS.md
2. /Users/erniesg/code/erniesg/aether/CLAUDE.md
3. /Users/erniesg/code/erniesg/aether-design-capability-factory/docs/decisions/2026-04-24-capability-factory.md
4. /Users/erniesg/code/erniesg/aether-capability-factory-foundation/docs/HANDOFF-CAPABILITY-FACTORY-2026-04-24.md
5. /Users/erniesg/code/erniesg/aether-capability-factory-foundation/docs/progress/feat-capability-factory-foundation.md

Work only in:
- repo: /Users/erniesg/code/erniesg/aether-capability-factory-foundation
- branch: phase/39-capability-factory-foundation

Tracked issues:
- #39 capability factory foundation
- #40 Discord human-review routing
- #41 spatial effect seam — image to particles / gaussian splat example

Current status:
- route-human label exists
- route-human GitHub workflow exists
- Discord routing is wired to channel 1496938045876731955 via webhook fallback or DISCORD_BOT_TOKEN + channel id
- pure planner exists in lib/capability/factory.ts
- tests for planner and Discord routing are green

Your mission:
- continue until the capability-factory foundation is live enough to support a real draft spatial capability on the site
- do not stop at planning; implement the next working slice

Next slice requirements:
1. Add typed tool/workflow/skill registry modules.
2. Extend capability definitions to reference typed registry entries and versions.
3. Thread those ids through rerun/provenance paths without breaking existing image-gen capability behavior.
4. Add tests first, then minimal implementation.
5. Run targeted tests and typecheck.
6. Push the branch and open/update a PR if useful.
7. If you reach a real human-review point, use the route-human label path.

After foundation lands:
- start #41 by adding the first spatial/provider seam for image -> particles / gaussian splat style output
- keep it provider-agnostic and creator-facing
- the goal is to get a draft but real capability path live on the site, not just docs

Constraints:
- do not revert unrelated user changes outside this worktree
- keep the canvas creator-first; no operator-dashboard drift
- preserve provider-agnostic contracts
- use red/green TDD
```
