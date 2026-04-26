# Handoff — Multimodal v1 + smoke evidence (2026-04-26 night, second session)

Picking up from `HANDOFF-2026-04-26-NIGHT-FAST-TIER-AB-REGISTRY.md`. The
previous session shipped four slices unit-tested only; this session ran
real auto-mode laps against eightsleep, surfaced a few real-world bugs
(timeout, hero-less-but-marked-ready, payload bloat), fixed them, and
extended the trigger surface to URL + PDF + image-file inputs.

## Per-slice + per-feature verdict (this session)

| change | verdict | evidence |
|---|---|---|
| Eightsleep smoke (text trigger) | **READY** | hero.png + envelope.json + format-crops.json + scheduledPostIds=['sp_mofoht40_1'] saved to `docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26/` |
| Eightsleep smoke (URL trigger) | **READY** | url-hero-2.png + caption captures dual-zone cooling + 30-night trial language; 4 SG-locale captions; scheduledPostIds=['sp_mofp3typ_1'] |
| URL ingestion (multimodal v1) | **READY** | `lib/ingest/url.ts` — title / description / og:image / 12 body images / Schema.org products / body excerpt; 8 unit tests; verified against real eightsleep.com |
| Multi-image references | **READY** | `lib/agent/multi.ts` attachReferenceImages + `referenceImages?: AutoModeReferenceImage[]` plumbed end-to-end; legacy singular `referenceImage` still accepted; URL ingestion auto-derives top 3 refs |
| PDF ingestion (multimodal v2) | **READY** | `lib/ingest/pdf.ts` (pdf-parse v2 class API); 6 unit tests + verified locally against bitcoin whitepaper (9 pages, 21363 chars); auto-mode routes when `kind='file'` and payload sniffs as PDF |
| Image-file trigger | **READY** | `kind='file'` + payload sniffs as image (`data:image/*` or `.png/.jpg/.webp/.gif/.avif/.heic` URL) → auto-derived reference image; 2 unit tests |
| OpenAI timeout 120s → 240s | **READY** | bump + `OPENAI_IMAGE_TIMEOUT_MS` env override; surfaced by smoke #1 timing out at 125s |
| Variation status fix | **READY** | a hero-less variation is now `status='failed'` with the underlying step error in `error`; was silently `'ready'` before |
| Data-URL prompt redaction | **READY** | trigger payload + layout-aware lead replace `data:` blobs with friendly tags so 1MB base64 doesn't explode the variation prompt |
| Hero asset upload (SAM3 unblock) | **NOT DONE** | masks remain absent in real laps; gpt-image-2 returns data URLs, SAM3 needs fetchable. Task #11. |
| WorkspaceShell UI integration | **NOT DONE** | Components built standalone (slice #5 from prior handoff). Task remains |
| Slow-tier layer extraction | **NOT DONE** | Slice #3 from prior handoff. Task remains |
| Self-critique / N variation selection | **NOT DONE** | Future. The agent generates variations; a critic that scores + picks best is an open slice |

## Stats

- **8 commits this session**: `5808a24` … `b2de33f` (counting prior session: total 12 ahead of `cc71e74`)
- **Vitest: 1106 passing | 1 skipped** (153 files; was 1046 at start of prior session, +60 across the two sessions)
- **TypeScript: 3 pre-existing test warnings** (`endCall is possibly undefined` in auto-mode.test.ts — unrelated)
- **New deps**: `pdf-parse` + `@types/pdf-parse` + `@types/jsdom`

## What you can do today end-to-end

```bash
# Text trigger — what you'd post normally
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"text","payload":"…"},"variationCount":1,
       "notifyMode":"auto-post","workspaceId":"ws-x"}'

# URL trigger — auto-mode fetches the page, extracts hero/products,
# uses og:image as primary ref, top 2 body images as supplementary
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"url","payload":"https://www.eightsleep.com/"},
       "variationCount":1,"notifyMode":"auto-post","workspaceId":"ws-x"}'

# PDF trigger — auto-mode fetches/decodes the PDF, extracts text,
# weaves into the prompt
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"file","payload":"https://example.com/spec.pdf"},
       "variationCount":1,"notifyMode":"auto-post","workspaceId":"ws-x"}'

# Image-file trigger — payload IS the image (data URL or http url),
# becomes the reference for hero gen
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"file","payload":"https://cdn.example.com/photo.jpg"},
       "variationCount":1,"notifyMode":"auto-post","workspaceId":"ws-x"}'

# Multiple explicit references — brand kit + product photo set
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"text","payload":"…"},"variationCount":1,
       "notifyMode":"review","workspaceId":"ws-x",
       "referenceImages":[
         {"url":"https://…/brand.png","hint":"brand kit"},
         {"url":"https://…/product.png","hint":"product photo"}
       ]}'
```

For each path the lap returns `{ campaignId, status, variations[],
scheduledPostIds[], urlIngestion?, pdfIngestion? }`. The variations carry
`heroImageUrl` (data URL today), `caption + captionsByLocale (4 SG
locales)`, `hashtags`, `formatCrops` (1:1 fitted; 4:5/9:16/16:9 partial),
`textOverlays` (multilingual), `agentSteps` (per-tool ledger ids), and
`error` if anything fails.

## What's still missing for the full eightsleep demo Ernie sketched

1. **Hero asset upload → SAM3 A/B unblock** (Task #11). gpt-image-2
   returns data URLs; SAM3 (Modal worker, external) can't fetch them.
   Both `masksOneShot` and `masksVisionGuided` are therefore absent in
   every real lap today even though the wiring is fully built. Fix:
   upload the data URL to Convex storage (or a temp /api/asset
   route) and replace `heroImageUrl` with the fetchable URL before
   running runPostHeroPipeline. ~30-60 min.

2. **WorkspaceShell UI integration** (Slice #5). `AutoModeToggle.tsx`
   and `AutoModePanel.tsx` exist standalone. Once wired into
   `WorkspaceShell.tsx` (1944 lines, careful), Ernie can drop URLs / PDFs
   / images on the canvas, watch the lap fire, inspect every step in
   the right rail. Without this you only see runs by curl-ing the API.

3. **Slow tier — layer extraction + inpaint** (Slice #3). Per-component
   masks → cutout PNGs → inpainted background → editable layers. Needed
   for extreme aspect crops (LinkedIn 1200×627 banner from a 1:1 hero
   loses the subject). 3-4 hr. Blocked on item 1 since SAM3 has to
   fetch the hero.

4. **Self-critique / N-variation selection**. Today the lap returns N
   variations; nothing scores them. The user picks. A critic pass
   (Claude vision scoring brand fidelity / composition / caption fit)
   would pick the best variant automatically. Open design.

5. **Discoverable tools — describe_image + segment_subjects as agent
   tools**. Slice #4's tool registry is in place, so adding these is
   one new file each. Lets Claude ad-hoc invoke them mid-lap when the
   brief implies (`"describe what's in this image"` from a creator
   chat).

6. **Future / nice-to-have** (per Ernie's note): node-graph view that
   lets users fork off mid-lap. Open issue, future.

## Smoke evidence files

`docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26/`:
- `request-body.json` / `url-request-body.json` — exact payloads
- `response.json` — first smoke (gpt-image-2 timed out at 125s; before
  the 240s bump)
- `response-2*.json` + `hero.png` — text-trigger smoke after the
  timeout fix; hero is a chrome-navy bedroom matching the brief
- `url-response-*.json` + `url-hero-{1,2,3}.png` — URL-trigger
  smokes; final hero (#3) shows the multi-image-ref output
- `url-ingestion.json` — what we extracted from eightsleep.com
- `url-envelope-*.json` — caption / hashtags / locale captions /
  scheduling / mood note from the agent's JSON envelope
- `format-crops.json` — 4 crop rectangles in normalized coords

## Hard rules — checked

- Single synthesis-shell workspace ✅ (no new routes; new modules are
  pure helpers + auto-mode plumbing)
- Strict UI taxonomy ✅ (no UI changes this session)
- Provider-agnostic AI ✅ (pdf-parse is a pure parser; no model is
  hardcoded; OpenAI timeout is overridable per-deploy)
- Typed provenance ✅ (every mutation still flows through `recordRun*`;
  `agentRunIds[]` cross-link variations to capabilityRun)
- Graph-first persistence ✅ (campaignVariation gets `masksOneShot`,
  `masksVisionGuided`, `scheduledPostIds`, `urlIngestion`,
  `pdfIngestion` flow through the lap result)
- Red/green TDD ✅ (every behavior change in this session has a
  failing test ahead of the impl: 23 new tests, 5 modified)

## File policy reminder

`.env.local` continues to point at `oceanic-dolphin-808.convex.cloud`.
Do not run `npx convex deploy` without Ernie's authorization — the
prior handoff flagged this CLI-auth alignment artifact.

---

**Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>**
