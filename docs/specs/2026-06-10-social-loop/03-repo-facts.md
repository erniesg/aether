# Spec 03 — Repo-facts ingestion (GitHub → project facts, context.dev seam)

- Status: todo
- Priority: P1 · Track: presence
- Branch: codex/social-03-repo-facts
- Depends: none
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/03/

## Summary

Point aether at a GitHub repo and it extracts project facts (claims with real numbers, releases, stack) as creator context — the raw material for presence-campaign drafts. Optional context.dev enrichment behind a provider seam.

## QA Plan

### Features

- F1 — `lib/research/repo-facts.ts`: a public GitHub repo URL resolves to `ProjectFacts { name, description, claims[], releases[], languages[], readmeHighlights[] }` via the public GitHub API (optional env name `GITHUB_TOKEN` raises rate limits; never logged)
  - **Falsifiable**: given a fixture API payload, the extractor returns ≥3 claims each containing at least one number or named technology; malformed/404 repos throw a typed error, not a crash
  - **Verification**: unit tests with recorded fixture JSON (no live network in tests)
  - **Proof**: test ids in `lib/research/repo-facts.test.ts`
- F2 — Facts persist through the existing context tables: a `sourceItem` of kind `repo` (already in `convex/schema.ts`) plus `productFact` rows carrying the claims
  - **Falsifiable**: after ingestion, `productFact` query for the workspace returns the extracted claims; re-ingesting the same repo updates rather than duplicates (row count stable)
  - **Verification**: convex function unit test; idempotency test
  - **Proof**: test ids; convex snapshot diff in evidence/03/notes.md
- F3 — Enrichment provider seam: `ContextEnrichmentProvider` interface with a context.dev adapter (env name `CONTEXT_DEV_API_KEY`); when the key is unset the adapter reports unavailable and ingestion completes GitHub-only
  - **Falsifiable**: with the key unset, ingestion returns facts with `enrichment: none` and exits 0; the adapter contract test exercises request/response shape against a fixture
  - **Verification**: contract test mirroring `lib/providers/image/*.contract.test.ts` pattern
  - **Proof**: test ids in the new contract test file

New files to add: `lib/research/repo-facts.ts`, `lib/research/repo-facts.test.ts`, `lib/providers/enrichment/` (types, context-dev adapter, registry, contract tests), rail wiring in the brand/research section for "add repo" input

### Critical journeys

- J1 — Repo → facts in the rail
  - **Steps**: 1. Open `/workspace/demo-ws` 2. In the left rail, add a repo URL as a knowledge source 3. Ingest
  - **Falsifiable**: the rail section's summary chip count increases and the facts are listed (one line each, progressive disclosure); a `sourceItem` kind `repo` row exists for the workspace
  - **Verification**: component test driving the add-repo path with a mocked extractor
  - **Proof**: component test id + screenshot

### Surfaces touched

- **Web**: `/workspace/[wsId]` (left rail brand/research section)
- **API**: ingestion route (new, under `app/api/`)
- **Worker / job / cron**: none

### Proof artifacts required

- [ ] unit + contract test run output (all green) — evidence/03/notes.md
- [ ] screenshot of the rail with ingested repo facts — evidence/03/notes.md
- [ ] convex snapshot showing `sourceItem` kind `repo` + `productFact` rows — evidence/03/notes.md

### Media proof

- route / surface: left rail knowledge-source input on `/workspace/[wsId]`
- interaction: paste repo URL → ingest → facts listed
- proof: screenshot + component test id

### Personas firing (auto-detected, listed for clarity)

- correctness, provenance, ux-restraint, security-cost

## Acceptance criteria

- [ ] Extractor returns ≥3 numeric/tech-bearing claims from the fixture repo payload (test id)
- [ ] Ingestion is idempotent — same repo twice, stable row count (test id)
- [ ] `CONTEXT_DEV_API_KEY` unset → GitHub-only path exits 0 with `enrichment: none` (test id)
- [ ] No token value is ever logged or persisted — env names only (grep proof in evidence/03/notes.md)
- [ ] Rail shows facts under progressive disclosure (screenshot; one line per fact)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `convex/schema.ts` (`sourceItem` kind `repo`, `productFact`)
- External: https://context.dev (enrichment API)
