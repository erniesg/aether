# Handoff — Q5: Auto-schedule + post to social

**Demo question 5.** "Auto-schedule + post to social media platforms for distribution."

## Goal

After fan-out lands a variant pack, the creator presses one button and the variants are scheduled to (or posted directly to) IG, X, LinkedIn, TikTok via a single seam. Provider-agnostic: switch from preview-only to real posting by configuring an env var.

## Current state on `main` (commit `a1752869` on stg)

What works (live on stg):
- **Publisher seam**: `lib/providers/publisher/registry.ts`, `types.ts`, `preview.ts`, `postiz.ts` (HTTP client), `social-auto-upload.ts`. Three adapters behind one interface.
- **Schedule API**: `app/api/publish/schedule/route.ts` accepts `{ workspaceId, post: { id, caption, mediaUrls[] }, scheduledFor }` and returns `{ providerId, status: 'scheduled' | 'preview-only' | 'skipped' | 'failed', previewUrl? }`.
- **Storage**: `lib/providers/publisher/memory-storage.ts` (in-memory `ScheduledPostStorage`). Convex persistence exists but isn't wired here yet — passes through memory-storage on stg.
- **Provider resolution**: `resolvePublisher` picks `preview` (always available) → `postiz` (if `POSTIZ_BASE_URL` + `POSTIZ_API_KEY`) → `social-auto-upload` (if `SAU_BASE_URL`). Falls through `PUBLISHER_PROVIDER` env override.

What's missing (the work):
1. **Real Postiz sidecar** wired against staging — env vars + smoke verification of an actual scheduled post on Postiz UI. Currently preview-only on stg.
2. **Open PR #84** (`codex/finish-expansion-wave`, `aether-finish-up` worktree) wires server-side scheduling + Postiz + social-auto-upload. Needs product decision: merge it, or close in favor of preview-only.
3. **Convex persistence for scheduled posts** — replace in-memory storage so reloads don't lose schedules.
4. **UI affordance** — currently no way to trigger a schedule from the canvas. Need a "Schedule" button on the export pack panel that gathers the variants, calls `/api/publish/schedule`, and shows status.
5. **Per-platform variant mapping** — given a fan-out pack of {IG post, IG story, reel cover, LinkedIn}, route each to the right platform on Postiz.

## Architecture (per provider mandate)

| Job | Provider |
|---|---|
| Routing decision (which variant → which platform) | Claude Opus 4.7 (planner) |
| Cross-platform supervisor + per-platform subagent | **Anthropic Managed Agents** (one supervisor session, one subagent session per platform) |
| Posting | Postiz sidecar (primary) + social-auto-upload (CJK platforms — Douyin/XHS/Bilibili) |
| Storage | Convex `scheduledPost` table + `agentSession` table (new — see prereqs) |
| Preview / fallback | `PreviewPublisher` (always available) |

Postiz/SAU stay third-party but are the *only* publishers we need. No Buffer, no Hootsuite, no native API integrations.

**Why Managed Agents fit here (uniquely well):**

1. **Parallel isolation** — IG/X/LinkedIn/TikTok have different auth, rate limits, and failure modes. Each platform = one subagent session. An IG OAuth refresh failure does not tank the X post.
2. **Durable schedules** — "post 7 days from now" needs the agent to be wakeable when the timer fires, with full prior context (variant, copy, cta). Managed Agent sessions are exactly this.
3. **Audit trail** — every `scheduled → posted → succeeded | failed | rate-limited | re-queued` becomes an event on the session log; pairs with our typed-provenance hard rule.

**Invocation pattern** (see Q5 design notes inline below):

```ts
// lib/agent/managed/publishOrchestrator.ts
const supervisor = await client.beta.agents.sessions.create({
  model: 'claude-opus-4-7',
  system: PUBLISH_SUPERVISOR_PROMPT,             // cached
  tools: [spawnPlatformSubagent, persistScheduleRow, notifyHumanOnFailure],
});
// run loop: append events, run, handle tool calls, spawn per-platform sub-sessions.
```

The exact SDK surface (e.g. `client.beta.agents.sessions.*`) may differ — verify against current `@anthropic-ai/sdk` at implementation time. Pattern: sessions own context, tools are external, multi-agent = sessions calling sub-sessions.

## Acceptance criteria

1. `tests/unit/api-publish-schedule.test.ts` — covers all four status codes (`scheduled`, `preview-only`, `skipped`, `failed`) against mocked Postiz responses.
2. `tests/integration/postiz-sidecar.test.ts` — runs against a real or mocked Postiz instance to prove the contract (gated behind `POSTIZ_BASE_URL` so CI can skip).
3. **UI**: from the export pack lens, "Schedule" button → modal asks "when?" → calls `/api/publish/schedule` for each variant → shows per-variant status pills.
4. **Routing**: given a 4-variant pack, the planner emits one schedule call per variant with `platform: 'instagram' | 'x' | 'linkedin' | 'tiktok'`.
5. **Convex persistence**: `scheduledPost` rows reflect the schedule and survive reload (currently in-memory only).
6. **E2E**: `tests/e2e/schedule-pack.spec.ts` — fan-out pack → Schedule → 4 rows persisted → status pills visible.

## Decision pending (Ernie)

**Should we merge PR #84 (real Postiz sidecar) or close it?**

- Merge if we want the demo to claim "real posting credibility". Requires standing up a Postiz instance + setting `POSTIZ_BASE_URL` / `POSTIZ_API_KEY` as wrangler secrets.
- Close if preview-only path is enough — the seam is real and platform readiness is shown by the four status codes. Saves us the sidecar setup.

The handoff agent should not make this decision unilaterally. Ask Ernie or default to the preview-only path for the demo.

## Files to read

- `AGENTS.md`, `CLAUDE.md`
- `lib/providers/publisher/` (all files)
- `app/api/publish/schedule/route.ts`
- `convex/schema.ts` (scheduledPost table)
- PR #84 in the `codex/finish-expansion-wave` branch — review what it adds (mostly Convex storage + adapter resolution).
- Issues #56 (PostizPublisher), #57 (SocialAutoUpload CJK), #71 (Publisher seam — already merged).

## Validation path

```bash
npm test
npm run typecheck
PORT=3107 npx playwright test tests/e2e/schedule-pack.spec.ts
npm run cf-build
# don't deploy without human review
```

## Out of scope

- New publisher providers beyond Postiz + social-auto-upload.
- Authentication flows for the publisher (Postiz handles per-platform OAuth itself).
- Analytics / post performance tracking.

## Commit conventions

`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Conventional-commit prefixes. Don't force-push main.
