# Spec 03 evidence

## Commands

Red run, before implementation:

```text
npx vitest run lib/research/repo-facts.test.ts lib/research/evidence-facts.test.ts lib/providers/enrichment/context-dev.contract.test.ts tests/unit/convex-evidence-facts.test.ts tests/unit/api-evidence-ingest.test.ts tests/component/brand-section.test.tsx

Expected failures:
- Failed to resolve import "./repo-facts"
- Failed to resolve import "./evidence-facts"
- Failed to resolve import "./context-dev"
- Failed to resolve import "../../convex/evidenceFacts"
- Failed to resolve import "@/app/api/evidence/ingest/route"
- Unable to find [data-testid="evidence-facts-summary"]
```

Green gates:

```text
npm run typecheck
> tsc --noEmit
exit 0
```

```text
npx vitest run lib/research/repo-facts.test.ts lib/research/evidence-facts.test.ts lib/providers/enrichment/context-dev.contract.test.ts tests/unit/convex-evidence-facts.test.ts tests/unit/api-evidence-ingest.test.ts tests/component/brand-section.test.tsx tests/component/left-rail.sections.test.tsx

Test Files  7 passed (7)
Tests       33 passed (33)
```

No spec-specific e2e was named in `03-repo-facts.md`; the critical rail journey is covered by the component test plus browser screenshot below.

## Proof ids

- Repo fixture extraction: `lib/research/repo-facts.test.ts:51` proves >=3 numeric/tech claims, languages, releases, README highlights, and repo source attribution.
- Malformed/404 repo handling: `lib/research/repo-facts.test.ts:77` and `lib/research/repo-facts.test.ts:84` prove typed `RepoFactsError` paths.
- Convex persistence: `tests/unit/convex-evidence-facts.test.ts:97` proves `sourceItem.kind = repo` plus `productFact.claims`; `tests/unit/convex-evidence-facts.test.ts:122` proves same-repo reingest keeps `sourceItem` and `productFact` row counts stable.
- Context.dev unavailable path: `lib/providers/enrichment/context-dev.contract.test.ts:44` proves unset `CONTEXT_DEV_API_KEY` returns `enrichment: none` and does not fetch.
- Context.dev request/response contract: `lib/providers/enrichment/context-dev.contract.test.ts:55` proves endpoint, auth header shape, schema body, and mapped enriched claims.
- Resume facts and no raw-text logging: `lib/research/evidence-facts.test.ts:20` proves >=3 resume claims, resume source attribution, and no `console.log/warn/error` calls.
- Site facts: `lib/research/evidence-facts.test.ts:38` proves >=2 site claims with site source attribution.
- Rail facts list: `tests/component/brand-section.test.tsx:82` proves repo ingest calls the evidence path and renders one row per fact.
- Rail summary chip: `tests/component/left-rail.sections.test.tsx:66` proves repo evidence ingest updates the compact brand chip from `0 sources` to `1 sources`.

## Media proof

- Screenshot: `docs/specs/2026-06-10-social-loop/evidence/03/repo-facts-rail.png`
- Route/surface: `/workspace/evidence-03`, left rail brand input.
- Interaction: opened brand rail, pasted `https://github.com/vercel/next.js`, clicked `ingest`.
- Browser-observed result: compact chip showed `1 sources`, flyout header showed `1 sources`, evidence block showed `7 facts`; screenshot shows one-line fact rows and the `repo` knowledge source.

## Convex snapshot

Reproduced by `tests/unit/convex-evidence-facts.test.ts:97` and `tests/unit/convex-evidence-facts.test.ts:122`.

```json
{
  "before": {
    "sourceItem": [],
    "productFact": []
  },
  "afterFirstRepoIngest": {
    "sourceItem": [
      {
        "wsId": "workspace_demo",
        "kind": "repo",
        "payload": {
          "sourceKind": "repo",
          "ref": "https://github.com/erniesg/aether",
          "name": "aether",
          "claimCount": 3
        },
        "tags": ["evidence", "repo"]
      }
    ],
    "productFact": [
      {
        "wsId": "workspace_demo",
        "name": "aether",
        "claims": [
          "aether has 42 GitHub stars.",
          "aether uses TypeScript and Convex.",
          "aether published release v0.5.0."
        ]
      }
    ]
  },
  "afterSecondRepoIngest": {
    "sourceItemRowCount": 1,
    "productFactRowCount": 1,
    "updatedClaim": "aether README names tldraw as the canvas engine."
  }
}
```

## Grep proof

Raw resume text is not logged or sent to telemetry in the ingestion path:

```text
rg -n "console\\.|logger|telemetry" lib/research/evidence-facts.ts lib/research/evidence-ingest.ts app/api/evidence/ingest/route.ts lib/research/repo-facts.ts lib/providers/enrichment/context-dev.ts convex/evidenceFacts.ts components/rail/sections/BrandSection.tsx || true

(no matches)
```

Secrets are referenced by environment variable name only; values are only placed into request headers:

```text
rg -n "GITHUB_TOKEN|CONTEXT_DEV_API_KEY|Authorization|Bearer|process\\.env" lib/research/repo-facts.ts lib/providers/enrichment/context-dev.ts lib/research/evidence-ingest.ts app/api/evidence/ingest/route.ts convex/evidenceFacts.ts components/rail/sections/BrandSection.tsx

lib/research/repo-facts.ts:98:  const token = opts.token ?? process.env.GITHUB_TOKEN;
lib/research/repo-facts.ts:103:  if (token) headers.Authorization = `Bearer ${token}`;
lib/providers/enrichment/context-dev.ts:13:  apiKey = process.env.CONTEXT_DEV_API_KEY,
lib/providers/enrichment/context-dev.ts:32:          Authorization: `Bearer ${key}`,
```

## Dependency note

No new runtime dependencies were added.
