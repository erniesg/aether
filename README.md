# aether

aether is a creator-first canvas for turning references, a brief, and product constraints into editable key visuals and linked multiformat variants.

The canvas is the product surface. Rails feed material into it; the bottom composer acts on an explicit scope; generated artifacts return to the canvas for review, editing, propagation, and export. Research, automation, and provenance support that loop rather than becoming separate dashboards.

## Creator loop

1. Gather references, brand material, product facts, a brief, and output targets in the left rail.
2. Compose a multimodal input set from the selected material and constraints.
3. Generate through the prompt composer at the bottom of the canvas.
4. Promote a result into a key visual and make precise canvas edits.
5. Pin useful Claude-driven actions as reusable capabilities.
6. Fan the key visual out to linked format variants; global edits propagate while local overrides remain scoped.
7. Approve and export the pack with provenance.

See [AGENTS.md](./AGENTS.md) for the product and interaction contract.

## Primary surfaces

- `/workspace/<wsId>` — the single synthesis-shell workspace and primary creator surface.
- `/auto-mode` — a supporting automation entry point, not the product shell.
- `/inspect/<campaignId>` — a disclosed run/provenance view for diagnosis and review.

Raw identifiers, payloads, traces, and health information belong in diagnostic surfaces or `?debug=1`, not in the default creator experience.

## Stack

- Next.js 15.5, React 19, TypeScript, and Tailwind
- tldraw 4.5 for the canvas
- Convex for canonical graph state, actions, and file storage
- Provider adapters under `lib/providers/` for image, video, reference, segmentation, clustering, spatial, and publishing capabilities
- OpenNext on Cloudflare Workers
- Vitest, React Testing Library, and Playwright

Provider selection belongs in configuration or a request hint. Do not hardcode a default image or video model in product code.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run convex:dev
npm run dev
```

Open `http://localhost:3000/workspace/demo-ws`. Configure only the external providers needed for the flow you are exercising; `.dev.vars.example` documents the available settings.

`next.config.ts` loads `.dev.vars` for local Next.js processes. Keep secrets out of commits and generated artifacts.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Use the narrowest relevant gate while iterating, then run the broader gate appropriate to the change before merge. Provider adapters should have contract tests; creator-loop changes should include human validation of the visible workspace.

## Deployment

```bash
npm run preview
npm run deploy:stg
npm run deploy:prod
```

Deployment uses `open-next.config.ts`, `wrangler.jsonc`, and Convex. The staging and production commands also enforce the required tldraw license configuration.

## Repository map

```text
app/                    Next.js routes and API handlers
components/canvas/      canvas, lenses, and custom shapes
components/rail/        compact and expanded input surfaces
components/composer/    scoped bottom prompt composer
components/workspace/   synthesis-shell composition
lib/providers/          provider-agnostic capability adapters
lib/capability/         capability contracts and registry
lib/agent/              agent tools and orchestration
convex/                 canonical schema, queries, mutations, and actions
tests/                  unit, component, contract, and end-to-end tests
docs/                   current design, architecture, testing, and operations guidance
```

Useful starting points:

- [AGENTS.md](./AGENTS.md) — canonical product identity and UI rules
- [CLAUDE.md](./CLAUDE.md) — implementation guardrails and commands
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system boundaries and data flow
- [docs/TESTING.md](./docs/TESTING.md) — test strategy and workflows
- [docs/agent-routing.md](./docs/agent-routing.md) — issue and agent routing policy

## Generated artifacts

`outputs/` is ignored. It may contain large renders, browser profiles, traces, or credentials and is never a source directory. Put small, intentional test fixtures under the relevant test or documentation path and review them before committing.

## License

MIT
