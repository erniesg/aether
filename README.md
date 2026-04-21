# aether

A canvas-native creative system. Generate and edit assets directly on the canvas; pin AI-driven actions as reusable capabilities; fan one hero scene out to linked multiformat variants.

Built with [Claude Opus 4.7](https://www.anthropic.com/) for the _Built with Opus 4.7_ hackathon (April 2026). All code authored after kickoff 2026-04-21 12:30 PM EDT.

## Live

- Staging: `aether-stg.berlayar.ai`
- Production: `aether.berlayar.ai`

## Start here

- [`AGENTS.md`](./AGENTS.md) — product identity + UI direction
- [`CLAUDE.md`](./CLAUDE.md) — agent guardrails + hard rules
- [`docs/PRD.md`](./docs/PRD.md) — MVP scope, non-goals, success criteria
- [`docs/DEMO.md`](./docs/DEMO.md) — 3-min demo beat sheet
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system diagram, schema, provider contracts
- [`docs/TESTING.md`](./docs/TESTING.md) — red/green acceptance checklist + human gates
- [Issues](https://github.com/erniesg/aether/issues) — the task graph

## Dev

```bash
# install
npm install

# local dev (runs Next.js + listens for OpenNext CF bindings)
cp .dev.vars.example .dev.vars   # then fill in your keys
npm run dev                       # http://localhost:3000

# first-time Convex setup
npx convex dev                    # creates a Convex project, prints NEXT_PUBLIC_CONVEX_URL

# tests
npm test                          # vitest unit + component
npm run test:e2e                  # playwright

# type + lint
npm run typecheck
npm run lint

# build + deploy
npm run cf-build                  # opennextjs-cloudflare build
npm run deploy:stg                # wrangler deploy --env staging
npm run deploy:prod               # wrangler deploy --env production
```

## Stack

Next.js 15 · tldraw 3 · Convex · Claude Opus 4.7 (Anthropic SDK) · OpenNext Cloudflare Workers · Tailwind · Radix · Vitest + Playwright. Image + video generation is provider-agnostic; adapters live in `lib/providers/`.

## License

MIT
