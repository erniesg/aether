# CLAUDE.md

Implementation guardrails for agents working in aether. Read [AGENTS.md](./AGENTS.md) first; it is the canonical product identity and behavior contract.

## Product boundary

aether is a creator-first canvas. References, research, generation, editing, linked variants, and export all serve one creative loop inside a single synthesis shell. Do not turn supporting automation or provenance into an operator dashboard, run console, wizard, or separate product surface.

## Hard rules

Keep this list in sync with `AGENTS.md`.

1. Single synthesis-shell workspace; never route-split the creator loop.
2. Canvas is the substrate.
3. Strict UI taxonomy: `input | output | tool | navigation | metadata` — do not mix roles within one surface.
4. Keep the prompt composer at the bottom with an explicit scope.
5. Use progressive disclosure by default: icon plus short chip, expanded on click.
6. Prefer restraint over explanatory labels; layout carries meaning.
7. Keep AI provider-agnostic. Do not hardcode a default image or video model.
8. Record typed provenance on every action.
9. Persist canonical truth as a graph in Convex.
10. Use red/green TDD with human validation gates.

## Architecture and versions

| Layer | Current choice |
|---|---|
| Web | Next.js 15.5 App Router, React 19, TypeScript |
| Canvas | tldraw 4.5 |
| State and storage | Convex |
| AI and media | Provider contracts and adapters under `lib/providers/` |
| Deployment | OpenNext on Cloudflare Workers via `wrangler.jsonc` |
| Testing | Vitest, React Testing Library, Playwright |

Provider and capability modules must have clear contracts, unit or contract tests, and no cross-adapter dependencies. Model choice belongs in environment/configuration or an explicit request hint.

## Commands

```bash
# local development
cp .dev.vars.example .dev.vars
npm install
npm run convex:dev
npm run dev

# validation
npm run typecheck
npm test
npm run build
npm run test:e2e

# Cloudflare preview and deployment
npm run preview
npm run cf-typegen
npm run deploy:stg
npm run deploy:prod
```

Use focused tests while iterating and run the appropriate broad gate before merge. A creator-facing change also needs a human check of the real workspace interaction.

## Repository structure

```text
app/
  workspace/[wsId]/     primary synthesis shell
  auto-mode/            supporting automation entry point
  inspect/[campaignId]/ disclosed run/provenance view
  api/                   server-side capability routes
components/
  canvas/               tldraw canvas, lenses, and shapes
  rail/                 creator input sections
  composer/             scoped prompt composer
  workspace/            shell composition
  capability/           capability UI
lib/
  providers/            image, video, reference, segmentation, spatial,
                        clustering, and publisher adapters
  capability/           capability contracts and registry
  agent/                tool-use orchestration
  canvas/               canvas helpers
convex/                 schema, graph persistence, actions, and storage
tests/                  unit, component, contract, and end-to-end coverage
docs/                   maintained guidance plus clearly marked historical records
```

`open-next.config.ts`, `wrangler.jsonc`, and `next.config.ts` are the live deployment/runtime configuration. Do not document nonexistent paths or duplicate fast-changing schema details; link to the source instead.

## Implementation discipline

- Start from explicit acceptance criteria and the smallest verifiable change.
- Preserve the single shell and product vocabulary in creator-facing copy.
- Keep raw payloads, IDs, traces, and health checks behind `?debug=1` or a disclosed diagnostic view.
- Every workspace object should have a compact rail form, a focused shell form, and a canvas form. If it cannot have a canvas form, use a lens in the same shell.
- Add provenance when adding a mutation; do not bolt it on later.
- Keep provider adapters isolated so separate slices can land without cross-dependency conflicts.
- Commit coherent slices with conventional prefixes such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. Do not add automated attribution trailers.
- Do not force-push `main`. Use isolated worktrees for parallel or risky work.

## Secrets and generated files

- Local settings live in `.dev.vars`; never commit credentials.
- `outputs/` is generated and ignored. It can contain large media, traces, browser profiles, or tokens and must not be used as a source directory.
- Commit only small, intentional fixtures under the relevant test or documentation path.
- Treat historical handoffs as evidence, not as current operating instructions. Current behavior belongs in the root docs and maintained files under `docs/`.
