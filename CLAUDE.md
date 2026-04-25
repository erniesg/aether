# CLAUDE.md

Agent guardrails for the aether repo.

## What this repo is

**aether** — a canvas-native creative system. Creators generate and edit assets directly on the canvas; natural-language actions get pinned as reusable capabilities; one hero scene fans out to linked multiformat variants. Built for the _Built with Opus 4.7_ hackathon (kickoff Tue 2026-04-21 12:30 PM EDT). All code in this repo was authored after that kickoff.

For product identity and UI philosophy, read `AGENTS.md` first.

## Hard rules — do not break these

1. **Single synthesis-shell workspace.** Never split into per-step wizard routes. The workspace is one route with lens switches.
2. **Canvas is the substrate.** Other views are camera modes or overlays over the same underlying project, not separate products. References, generations, variants, and provenance all belong on the canvas where they participate in making.
3. **Strict UI taxonomy — no mixing inside one panel.**
   - Left rail = `input` (brand, offer, campaign, signals, research, references)
   - Right rail = `output` + `metadata` (active focus artifact, versions, observations, sync/provenance)
   - Canvas chrome = `tool` (floating draggable toolbar; one primary palette)
   - Header = `navigation`
   - State labels / timestamps / counts = `metadata`
4. **Prompt composer stays at the bottom** with an explicit scope chip (`global` / `local`) and an active-input-set chip.
5. **Progressive disclosure.** Default state of any rail section is a single icon + short chip; body expands on click. Density by default = product failure.
6. **Restraint over labels.** Layout, mono font, and paper texture carry meaning. One-line panel hint maximum. No subtitles, no per-item descriptions. If a panel feels empty, the layout is the problem; do not fill it with paragraphs.
7. **Provider-agnostic AI.** No default image or video model is hardcoded. The `ImageGenProvider` / `VideoGenProvider` interfaces route requests to any adapter (OpenAI, Gemini, Replicate, Volcengine Ark for Seedream/Seedance, HeyGen, Remotion). The choice of model lives in env/config, never in code paths.
8. **Typed provenance on every action.** Every mutation that touches canvas state records a versioned `ToolRef` / `SkillRef` / `WorkflowRef` with `inputs`, `outputs`, `beforeSnapshotRef`, `afterSnapshotRef`.
9. **Graph-first persistence.** Convex persists the canonical truth. Derived and session-only state never appear in the payload.
10. **Red/green TDD.** Every feature slice has acceptance criteria in its issue. Ship a failing test first, then the minimal code to make it green.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript | |
| Canvas | tldraw 3.x | local store, debounced snapshot to Convex |
| App state | Convex | reactive subscriptions keep rails/canvas/right rail coherent |
| Agent | Anthropic Claude Opus 4.7 | tool use + prompt caching |
| Image gen | `ImageGenProvider` with adapters | no hardcoded default |
| Video gen | `VideoGenProvider` with adapters | Remotion programmatic + AI adapters |
| Deploy | Cloudflare Workers via `@opennextjs/cloudflare` | `aether-stg.berlayar.ai` and `aether.berlayar.ai` |
| Styling | Tailwind + Radix + lucide | |
| Testing | Vitest + React Testing Library + Playwright | contract tests per provider; E2E for the full demo arc |

## Commands

```bash
# dev
npm run dev                       # next dev on :3000

# typecheck + lint
npm run typecheck
npm run lint

# test
npm test                          # vitest unit + component
npm run test:e2e                  # playwright

# build
npm run build                     # next build via opennextjs-cloudflare

# deploy
npm run deploy:stg                # wrangler deploy --env staging
npm run deploy:prod               # wrangler deploy --env production

# cloudflare
npm run preview                   # opennextjs-cloudflare preview locally
npm run cf-typegen                # regenerate cloudflare-env.d.ts

# convex
npx convex dev                    # live-sync functions + schema
```

## Repo structure

```
aether/
├── app/                          # Next.js app router
│   ├── (marketing)/              # future: landing, docs
│   └── workspace/[wsId]/         # the synthesis shell — single route, lens-switched
├── components/
│   ├── rail/                     # input-category rail sections
│   ├── canvas/                   # tldraw shapes + floating toolbar + lenses
│   ├── composer/                 # prompt composer
│   ├── right-rail/               # output + metadata
│   └── ui/                       # primitives
├── lib/
│   ├── providers/
│   │   ├── image/                # OpenAI / Gemini / Replicate / Volcengine adapters
│   │   └── video/                # Remotion / Seedance / HeyGen adapters
│   ├── agent/                    # Claude Opus 4.7 tool-use loop
│   ├── capability/               # CapabilityDefinition, pinning, registry
│   └── provenance/               # typed action records
├── convex/                       # schema + queries + mutations + actions
├── docs/                         # PRD, DEMO, ARCHITECTURE, TESTING
├── tests/
│   ├── unit/                     # vitest
│   ├── component/                # RTL
│   └── e2e/                      # playwright
├── public/
├── wrangler.toml                 # CF Workers config (staging + production envs)
├── open-next.config.ts
├── next.config.ts
├── package.json
├── CLAUDE.md
├── AGENTS.md
└── README.md
```

## Git workflow

- Commit frequently with conventional-commit prefixes: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
- Every commit from Claude includes `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Use red/green: a failing test is a valid intermediate commit (prefix `test:`), followed by a `feat:` commit that turns it green.
- Don't force-push `main`. Use worktrees for parallel work (`git worktree add ../aether-<slice> <branch>`).

## File policy

- Never delete files without user approval.
- Legacy references live in `/Users/erniesg/code/erniesg/aether-prehack/` — read them for product framing and visual essence only. Do not copy code.
