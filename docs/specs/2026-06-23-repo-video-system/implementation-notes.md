# Repo Video Motion First Slice Notes

- Plan: `docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md`
- Spec: `docs/specs/2026-06-23-repo-video-system/README.md`
- Branch: `codex/social-03-repo-facts`

## Implemented Slice

- Motion project primitives with frame math, workflow mode, drafts, timeline
  clips, exports, graph nodes, and provenance.
- Repo facts to launch/feature/social/demo motion projects.
- GitHub PR/code-change evidence provider contract and GitHub CLI provider.
- Motion component registry for hook, app frame, agent trace, proof, diff,
  mechanism, evidence, captions, voice lines, transitions, and CTA.
- Story-to-timeline compiler with captions, planned voice clips, transitions,
  and linked format scopes.
- Review-plan artifact for plan/draft review, full-auto action queues, editable
  component slots, and scoped regeneration requests.
- Timeline lens scaffold inside the single aether workspace shell.
- Draft motion tool registry and reusable workflow entries for repo launch,
  feature/social, website/app capture, PR explainers, caption overlays, motion
  graphics, and Remotion/HyperFrames portability.
- Agent motion workflow planner that turns a workflow id, mode, and source refs
  into gated tool/artifact plans for review mode or saved full-auto execution.
- Agent motion workflow router that picks the reusable workflow from intent and
  source refs, then returns the same review/full-auto plan.
- Agent motion workflow starter that turns a repo source into a routed workflow,
  materialized motion project, editable review plan, and explicit source/evidence
  requests when more material is needed.

## Verification Commands

```bash
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts
./node_modules/.bin/vitest run lib/motion/componentRegistry.test.ts lib/motion/reviewPlan.test.ts lib/motion/workflowPlan.test.ts lib/motion/workflowRouter.test.ts lib/motion/start.test.ts
./node_modules/.bin/vitest run tests/component/timeline-lens.test.tsx tests/component/view-switcher.test.tsx tests/component/view-switcher.focus-mode.test.tsx
npm run typecheck
git diff --check
```

## Browser Checkpoint

Validated `http://127.0.0.1:3000/workspace/demo-ws` in the in-app browser after
the timeline-lens commit:

- `timeline` tab opens inside the same synthesis shell.
- Input and output rails remain mounted.
- Bottom prompt composer remains visible and usable.
- Browser console had zero errors for the checked path.

## Research Follow-Up

Before locking component art direction, run an authenticated corpus pass over X,
YouTube, and product pages for current launch/demo videos from Anthropic,
OpenAI, Cursor, Linear, Screen Studio, Runway, Pika, HeyGen, Arcade, Clueso,
Descript, and HyperFrames daily skill launches. Tag each clip for hook, capture,
agent trace, proof, captions, voice, effects, transition language, CTA, and
export format.

The current implementation has the data and workflow seams to ingest that
corpus, but it does not yet include the corpus artifact, Remotion Player preview,
real render adapters, voice providers, or app capture execution.
