# Handoff — Auto Mode v1 + ledger port shipped (2026-04-26 late evening)

Picking up from `HANDOFF-2026-04-26-EVENING-AUTO-MODE-MANAGED-AGENTS.md`. Five commits landed on `main`:

| commit | what |
|---|---|
| `1110585` | demo files: multi-tool agent + Gemini video provider + handoff doc + .gitignore for `infra/postiz/.env.postiz` and `.claude/` |
| `5b9baaa` | multi.ts now writes every tool step to the `capabilityRun` ledger with typed ToolRefs (provenance fix) |
| `a588139` | safe subset of stash@{0} (research signals env vars, cluster-label fallback, SVG mime fix, signalCount field) |
| `22c7917` | Auto Mode v1 — orchestrator + campaigns ledger + Discord notify + 12 tests |

Total: **1038 vitest passing**, tsc clean, no regressions.

## Verdict per task (per evening handoff §12)

| task | verdict | notes |
|---|---|---|
| **Postiz hydration** | **BLOCKED-BY-UPSTREAM** | Needs `docker buildx --build-arg NEXT_PUBLIC_BACKEND_URL=…` rebuild from gitroomhq source. ~30 min op. Not started. See evening handoff §6 for the exact command. |
| **Stash recovery** | **SELECTIVELY-INTEGRATED** | 4 of 50 files applied (the safe ones); the rest deferred. See "Deferred from stash" below. Stash@{0} **was preserved** — `git stash list` still shows it. |
| **multi.ts → SessionManager port** | **READY (reinterpreted)** | The handoff §8 conflated `lib/agent/managed/sessionManager.ts` (Anthropic Beta hosted-agents wrapper, requires server-side agent template) with the runs-ledger provenance work. The actually-useful piece — every tool call writing to `capabilityRun` with a typed ToolRef — is shipped. The Beta-sessions migration is a separate, larger lift requiring agent-template registration with Anthropic. |
| **Auto Mode** | **PARTIAL — backend READY, UI deferred** | `/api/auto-mode/run` lives. Orchestrator runs N variations, persists to Convex `campaign` + `campaignVariation`, fires Discord webhook in notify mode. **No UI yet** — the workspace toggle, config popover, and right-rail progress strip are not built. See "Auto Mode UI — next slice" below. |
| **Prod DNS** | **WAITING-ON-ERNIE-DASHBOARD-CLICK** | Same blocker as evening handoff §7. `https://dash.cloudflare.com/5b25778cf6d9821373d913f5236e1606/berlayar.ai/dns/records` → delete the two apex A records (172.67.135.67, 104.21.6.206). Or paste a CF API token with `Zone:DNS:Edit` and a future agent automates it. |

## What landed in detail

### `lib/agent/multi.ts` ledger port

Every tool dispatch now opens a `capabilityRun` row before the fetch and finishes it after the response. The ledger row carries:

- `entryRef: { kind: 'tool', id: <registry-id>, version }` — typed provenance per CLAUDE.md hard rule #7.
- `tool / provider / model` — best-known stub at start (e.g. `modal-clip / clip-vit-b32` for cluster_references), refined on finish from the API response when it surfaces them (e.g. Gemini's `modelId`).
- `wsId` — optional workspace scope so the right rail can filter.
- `latencyMs` on success; `error + httpStatus` on failure.

3 new registry entries added: `signals-search`, `clusters-run`, `video-understand`. (`image-gen` already existed.)

`/api/agent` now accepts `wsId` in the request body and forwards it.

Logging is fail-soft: a Convex outage downgrades the ledger to best-effort and the agent loop keeps running.

### Auto Mode v1 — `/api/auto-mode/run`

```
POST /api/auto-mode/run
Content-Type: application/json
{
  "trigger": { "kind": "url|file|text", "payload": "..." },
  "variationCount": 1-4,
  "notifyMode": "notify" | "review" | "auto-post",
  "workspaceId": "<optional convex workspace id>",
  "maxIterationsPerVariation": <optional, defaults to runMultiAgent's 6>
}
```

Per variation:
1. `runMultiAgent` is called with a system prompt that hints the variation index, the prior moodNotes (so each variation is distinct), and asks for a structured JSON envelope as the final text.
2. The agent calls `search_signals` then `generate_image` (each writes to the ledger via the port above).
3. The orchestrator extracts the hero image URL from the agent's `generate_image` step output, parses the JSON envelope (caption, hashtags, platform, whenLocal, moodNote), and persists a `campaignVariation` row.

When the lap finishes, the orchestrator flips the `campaign` row to `completed` (or `failed` if any variation threw) and — in `notify` mode — fires `DISCORD_WEBHOOK_URL` with a one-line summary + campaign id.

**No SSE yet.** v1 returns the full result as one JSON response. SSE streaming is the natural next slice when the UI consumer lands.

### What's verified

- `tsc --noEmit` clean (full repo).
- 1038 vitest passing across 148 files. 12 of those are the new Auto Mode tests.
- `/api/auto-mode/run` route validation smoke-tested live on `:3002`:
  - empty body → `400` "trigger.kind must be one of: url, file, text"
  - bad kind → same
  - variationCount=99 → `400` "variationCount must be an integer in [1,4]"
- The earlier Apr 26 evening claims about `/api/research`, `/api/clusters/run`, `/api/video-understand`, `/api/agent` working live were preserved (no regression to those paths).

### What is **NOT** verified

- A real end-to-end Auto Mode lap (real Anthropic + image gen + Convex round-trip). Not run because (a) it consumes paid API credits and (b) the dev server's `CONVEX_DEPLOY_KEY` may or may not be set — the persistence path silently no-ops without it. **Ernie should run one real lap and confirm:** `curl -sS -X POST http://localhost:3002/api/auto-mode/run -H "Content-Type: application/json" -d '{"trigger":{"kind":"text","payload":"streetwear lookbook"},"variationCount":2,"notifyMode":"notify"}'` and check the Convex dashboard at `https://dashboard.convex.dev/d/careful-ermine-104` for the new `campaign` + `campaignVariation` rows + 4-ish `capabilityRun` rows.

## Auto Mode UI — next slice

The handoff §9 spec calls for these UI pieces (none built):

1. **`components/canvas/AutoModeToggle.tsx`** — workspace-level chip in canvas chrome (next to the floating toolbar). Off by default. When ON, dropping a URL or files into the composer triggers a lap.
2. **`components/canvas/AutoModeConfigPopover.tsx`** — opens on toggle click. Variation count (1-4 input), notify mode (notify / review / auto-post). Persist last selection per workspace via `workspaceProviderPrefs`-style row or new `workspaceAutoModePrefs` table.
3. **`components/right-rail/sections/AutoModeProgressSection.tsx`** — progress strip in the right rail. Subscribes to `useQuery(api.campaigns.get, { campaignId })` and renders Steps with their per-variation `capabilityRun` rows (already cross-linked via `agentRunIds`).
4. **SSE on `/api/auto-mode/run`** — replace the single JSON response with `text/event-stream` events: `lap-start`, `variation-start`, `tool-step`, `variation-ready`, `lap-complete`. Mirror the pattern in `/api/generate` (which already streams tool steps).

The orchestrator already returns enough data to drive the UI without SSE: `result.variations[].agentRunIds` lets the rail render the ledger view immediately on lap completion. SSE is polish.

## Deferred from stash

`stash@{0}` ("wip-other-agent-pre-pull-20260426-1638") still holds these unapplied changes (see `git stash show stash@{0} --name-only`):

- `app/api/research/route.ts` — depends on `lib/research/signals.ts` which is **not in the stash** and does not exist on disk. Stash is partially broken until `signals.ts` is authored.
- `lib/signals/convex.ts` — adds optimistic-update layer (memory + Convex merge). UI quality, not demo-blocking.
- `components/rail/sections/BrandSection.tsx` (823 lines) — large brand-rail rework. Needs review against current main's BrandSection.
- `components/workspace/WorkspaceShell.tsx` (726 lines) — big shell refactor. Risky to apply blind.
- `components/canvas/lenses/ClusterLens.tsx`, `components/composer/ComposerStatus.tsx`, `components/rail/sections/{Campaign,Offer,Research,Signals}Section.tsx` — UI polish.
- `lib/brand/{extract,ingest,propose,proposePrompts,shape}.ts` — brand pipeline tweaks.
- `lib/capability/store.ts`, `lib/context/creator-store.ts`, `lib/references/store.ts` — store layer changes.
- 9 `docs/handoffs/phase0-evidence/*.png` regenerations.
- 8 test deltas (brand-section, signals-section, view-switcher, e2e research-moodboard, etc.) and 4 unit tests (api-brand-propose, api-research, capability-store, proposeBrandFollowups).

To recover any one piece: `git diff stash@{0}^ stash@{0} -- <path> | git apply` and review.

## Smoke test commands (carry-over from evening handoff §10, plus new)

```bash
# Validation paths — no LLM cost
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{}'   # → 400 trigger.kind required

# Real one-variation lap (consumes credits)
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"text","payload":"streetwear lookbook"},"variationCount":1,"notifyMode":"review"}'

# Multi-tool agent (still works)
curl -sS -X POST http://localhost:3002/api/agent \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Find 5 streetwear lookbook refs on instagram, then cluster them.","wsId":"<convex-ws-id>"}'
```

## Hard rules — checked

- Single synthesis-shell workspace ✅ (no new routes added; `/api/auto-mode/run` is API-only, UI lands inside the shell)
- Strict UI taxonomy ✅ (no UI added yet — when added, toggle = canvas tool chrome, progress = right rail metadata)
- Provider-agnostic AI ✅ (Auto Mode calls `/api/generate` which routes through `ImageGenProvider`; no model hardcoded in orchestrator)
- Typed provenance ✅ (every tool step in every variation logs `entryRef` to `capabilityRun`)
- Graph-first persistence ✅ (`campaign` + `campaignVariation` are Convex tables; client subscribes via reactive queries)
- Red/green TDD ✅ (12 unit tests written alongside the orchestrator)

## What I would do next if I had another hour

1. Build `AutoModeToggle.tsx` + the right-rail progress section. Wire the toggle to `POST /api/auto-mode/run` from the composer's "drop a URL" action.
2. Run one real lap with Ernie's IG account / Discord webhook to prove the lap-completes → ping → review flow.
3. Author `lib/research/signals.ts` (the missing module from the stash) so the rest of the stash's research route changes can land.
4. Postiz hydration — kick off the upstream rebuild in the background.

## Where the conversation left off (literal)

User: "look at this and keep going... commit regularly... seems like lots of stuff hanging"

I committed five times. Stash is preserved. No force-pushes. No destructive ops.

---

**Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>**
