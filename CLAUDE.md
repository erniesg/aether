# CLAUDE.md

Implementation guardrails for agents working in aether. Read [AGENTS.md](./AGENTS.md) first; it is the canonical product identity and behavior contract.

## Product boundary

aether is a creator-first canvas. References, research, generation, editing, linked variants, and export all serve one creative loop inside a single synthesis shell. Do not turn supporting automation or provenance into an operator dashboard, run console, wizard, or separate product surface.

Aether is an optional downstream visual-composition consumer of approved Ernie.SG output through a verified, exact-pinned public Struct boundary. It does not own source acquisition or reconstruction, canonical text or semantics, editorial approval, deterministic XHTML/reflowable EPUB, or public research delivery. The current prototype does not implement that import/release boundary; target prose must remain explicitly future-facing.

## Hard rules

Keep this list in sync with `AGENTS.md`.

1. Single synthesis-shell workspace; never route-split.
2. Canvas is the substrate.
3. Strict UI taxonomy: `input | output | tool | navigation | metadata` — no mixing.
4. Prompt composer stays at the bottom with explicit scope.
5. Progressive disclosure default (icon + short chip, expand on click).
6. Restraint over labels — layout carries meaning, not walls of text.
7. Provider-agnostic AI. No default image or video model hardcoded.
8. Typed provenance on every action.
9. Graph-first persistence.
10. Red/green TDD with human validation gates.
11. Aether is optional and downstream; it owns visual composition and derivatives, not source semantics, editorial approval, or public delivery.
12. Canonical Struct text is read-only in Aether; semantic corrections return upstream as a new approved revision.
13. A-REQ and A-ACT stay inactive and fail closed; planning approval never authorizes outreach, activation, deployment, or printer submission.

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
- Keep future Struct imports behind authenticated actor/session/workspace authorization. Import, read, edit, release, and asset access are separate permissions; unauthorized and cross-workspace access must fail before domain or storage access.
- Do not silently migrate current `asset`, `exportPack`, `manifest.json`, workspace, or PNG-ZIP data into future import, `CreativeGraph`, or derivative-manifest types.
- Commit coherent slices with conventional prefixes such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. Do not add automated attribution trailers.
- Do not force-push `main`. Use isolated worktrees for parallel or risky work.

## Secrets and generated files

- Local settings live in `.dev.vars`; never commit credentials.
- `outputs/` is generated and ignored. It can contain large media, traces, browser profiles, or tokens and must not be used as a source directory.
- Commit only small, intentional fixtures under the relevant test or documentation path.
- Treat historical handoffs as evidence, not as current operating instructions. Current behavior belongs in the root docs and maintained files under `docs/`.
