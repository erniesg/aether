# event-recap playbook

Agent-agnostic playbook for producing evidence-grounded recaps of real-world events from public social posts.

## What this is

A thesis-balancing loop that iterates between candidate theses and the gathered corpus until the landed thesis fairly represents every stakeholder angle (speakers, sponsors, brands, highlights, participants) the corpus actually evidences. AIE Singapore 2026 is the canonical worked example.

The full playbook is `SKILL.md`. Read it before running on a new event. Cross-references in the form `[[references/foo]]` and `prompts/foo.md` resolve to files in this directory.

## How to invoke

### Any agent (Codex, GPT, generic LLM)
Point the agent at this directory. Have it read `SKILL.md`, then resolve references and prompts on demand:

```
Read aether/docs/playbooks/event-recap/SKILL.md and follow it to produce a recap of <event>. References live in references/, prompts in prompts/. Run in human-in-the-loop mode unless told otherwise.
```

### Claude Code
A thin shim is installed at `~/.claude/skills/event-recap/SKILL.md` that delegates here. Invoke as `/event-recap` or call the Skill tool with `event-recap`.

### Programmatic (any orchestrator)
The playbook references the actual aether codebase functions (`deriveSeedFrontier`, `analyzePosts`, `buildStoryAssignedThemes`, etc.). Orchestrators can call them directly per the file:line references in `SKILL.md`.

## Layout

```
docs/playbooks/event-recap/
├── README.md                     # this file
├── SKILL.md                      # the 14-step playbook
├── references/
│   ├── aie2026-walkthrough.md    # canonical worked example
│   ├── aie2026-stories.md        # 13-story config that shipped
│   ├── aie2026-methodology.md    # shipped lede + synthesis card copy
│   ├── aie2026-atlas-lanes.md    # 4 lanes + assignment logic
│   ├── stakeholder-angles.md     # five-angle dual-purpose framework
│   ├── thesis-rubric.md          # convergence criterion
│   ├── human-loop-junctures.md   # full-auto vs HITL pause points
│   ├── cluster-quality-checklist.md  # sniff-test rubric
│   └── signal-pattern-cheatsheet.md  # regex + weight conventions
└── prompts/
    ├── draft-theses.md
    ├── draft-stories.md
    ├── signal-pattern-author.md
    ├── cluster-sniff-test.md
    ├── thesis-balance-check.md
    ├── angle-synthesizer.md
    ├── lede-composer.md
    └── relabel-themes.md
```

## Key files in the aether codebase

The playbook calls into:

| Concern | File |
|---|---|
| Seed frontier (speakers + sponsors → query anchors) | `lib/research/event-recap/frontier.ts` |
| Post-hoc corpus expansion | `lib/research/event-recap/expand.ts` |
| Relevance filtering | `lib/research/event-recap/relevance.ts` |
| Graph-community clustering + silhouette/elbow | `lib/research/event-recap/analyze.ts` |
| Story assignment (signal regex + weights) | `lib/research/event-recap/story-assignment.ts` |
| LLM relabel + curated copy anchors | `scripts/event-recap-finalize-analysis.ts` |
| Atlas layout | `workers/aie2026-vibes.ts` |
| Dry-run estimate route | `app/api/vibes/estimate/route.ts` |
| Refresh trigger | `app/api/events/[eventId]/refresh/route.ts` |

## Mode

The playbook supports two modes:

- **HITL (default)** — pauses at five critical junctures (hypothesize / balance check / story authoring / land thesis / synthesize) for analyst approval
- **Full-auto** — skips pauses but logs each decision with evidence for audit

See `references/human-loop-junctures.md`.

## Gaps the playbook describes but the codebase doesn't ship yet

1. Story-aware re-gather (`/api/events/<id>/topup?storyId=X`)
2. Cluster review UI (rename / merge / split / reassign affordances)
3. `eventConfig` Convex table (lifts hardcoded AIE 2026 stories out of TS)
4. Thesis-balance scoring on the live report
5. Atlas in the live report (currently only in the static `workers/aie2026-vibes.ts`)

These belong in a parameterization PR companion to this playbook.
