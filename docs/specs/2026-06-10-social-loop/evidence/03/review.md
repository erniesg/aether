# Spec 03 review

- Verdict: **CHANGES-REQUESTED**
- Reviewer: Claude (reviewer protocol, README.md)
- Branch: codex/social-03-repo-facts @ be58546c
- Date: 2026-06-10

## Gates (rerun by reviewer)

- `npm run typecheck` → clean exit.
- `npx vitest run lib/research/repo-facts.test.ts lib/research/evidence-facts.test.ts lib/providers/enrichment/context-dev.contract.test.ts tests/unit/convex-evidence-facts.test.ts tests/unit/api-evidence-ingest.test.ts tests/component/brand-section.test.tsx tests/component/left-rail.sections.test.tsx` → 7 files, 33/33 passed.
- No e2e named in the spec; not required.
- Both grep proofs in notes.md reproduce: `rg -n "console\.|logger|telemetry" <ingestion path files>` → no matches; secrets greps show env **names** only, values only into request headers (`lib/research/repo-facts.ts:98,103`, `lib/providers/enrichment/context-dev.ts:13,32`).

## Acceptance criteria walk

| Criterion | Verdict | Proof |
|---|---|---|
| Extractor returns ≥3 numeric/tech-bearing claims from fixture | PASS | `lib/research/repo-facts.test.ts:51` — ≥3 claims, each checked for number-or-named-tech, repo source attribution; typed errors at `:77`, `:84` |
| Ingestion is idempotent — same repo twice, stable row count | **FAIL (wiring)** | `tests/unit/convex-evidence-facts.test.ts:122` proves `upsertEvidenceFactsForWorkspace` is idempotent — but no ingestion path ever calls it (see Blocking finding) |
| `CONTEXT_DEV_API_KEY` unset → GitHub-only, `enrichment: none`, exit 0 | PASS | `lib/providers/enrichment/context-dev.contract.test.ts:44` (no fetch, claims unchanged); fallback also at `lib/providers/enrichment/registry.ts:14` |
| No token value logged or persisted — env names only | PASS | grep proofs rerun by reviewer, reproduce notes.md exactly |
| Rail shows facts under progressive disclosure, one line per fact | PASS | `evidence/03/repo-facts-rail.png` (7 truncated one-line rows, `7 FACTS` chip, repo knowledge source) + `tests/component/brand-section.test.tsx:82` |
| Resume and site fixtures extract to shared fact shape with attribution | PASS | `lib/research/evidence-facts.test.ts:20` (≥3 resume claims, `kind: resume`, no console calls), `:38` (≥2 site claims, `kind: site`) |
| Raw resume text never in logs or telemetry | PASS | grep proof rerun; `evidence-facts.test.ts:20` additionally spies console |

## Blocking finding — F2/J1 persistence is dead code

`convex/evidenceFacts.ts` (upsert + list, validated against `sourceItem` kind
`repo` and `productFact`) is referenced **only by its own test**:

```
rg -n "evidenceFacts" lib app components convex tests
→ tests/unit/convex-evidence-facts.test.ts only
```

- `POST /api/evidence/ingest` parses `workspaceId` (`app/api/evidence/ingest/route.ts:35`) and then drops it; `ingestEvidenceFacts` hardcodes `persisted: false` on every branch (`lib/research/evidence-ingest.ts:38,44,52`).
- `BrandSection` puts the returned facts into component state only (`components/rail/sections/BrandSection.tsx:314-316`); the `1 sources` chip counts `BrandContext.knowledgeSources` in the creator store (`BrandSection.tsx:729-731`), not Convex `sourceItem` rows.

Consequences against the spec text:

- F2 falsifiable — "after ingestion, `productFact` query for the workspace returns the extracted claims" — is **falsified** on the live path: ingest a repo with a workspaceId, query `productFact` → empty. The convex snapshot in notes.md reproduces the helper, not ingestion.
- J1 falsifiable — "a `sourceItem` kind `repo` row exists for the workspace" — nothing in the journey creates it.
- F4 second half — "resume-derived facts persist only in workspace context tables" — currently they persist **nowhere**, which trivially satisfies the privacy half but not the persistence half.
- Downstream: specs 04/08 cite these facts as receipts by reading the context tables; without wiring, every ingested fact evaporates on reload and the demo journey (HANDOFF.md) breaks at step 2.

## Required changes (worker resumes at protocol step 3)

1. Wire the live path to `evidenceFacts.upsert` when a workspaceId is present. Either house pattern is acceptable: a client store following `lib/publish/draft-store.ts` / `lib/references/store.ts` (`anyApi` + localStorage fallback) invoked after a successful evidence ingest, or server-side persistence in the route via the existing `lib/convex/http.ts` client. Return `persisted: true` from the path that actually landed the row.
2. Red test first: a route/store test asserting the upsert is invoked with the extracted claims + workspaceId, and that re-ingesting the same ref through the **same live path** patches rather than inserts.
3. Refresh evidence/03/notes.md: convex snapshot must come from the wired path; point the J1 `sourceItem` claim at the new proof id.

Everything else is approved as-is — do not rework F1/F3/F4 extraction, the
enrichment seam, the rail UI, or the tests already cited.
