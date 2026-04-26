# Handoff — pick up where Opus 4.7 left off (2026-04-26 evening)

You are picking up an aether/Berlayar hackathon push for **Ernie** (`hello@ernie.sg`). Hackathon-mode, exhausted, low patience for "API responds, UX unverified" claims. Direct tone, evidence over claims. Conventional commit prefixes. Co-Authored-By: `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## TL;DR — your priorities (in order)

1. **Fix Postiz hydration (P0)** — the `/auth` page renders form chrome but a raw `<!DOCTYPE>` HTML blob leaks into the middle of the page; form submits via GET with creds in URL. Setting `MAIN_URL`, `BACKEND_INTERNAL_URL=http://localhost:3000`, and `NEXT_PUBLIC_BACKEND_URL` did **not** fix it. Diagnosis below in §6.
2. **Recover WIP stash + decide integration** — `git stash list` will show `wip-other-agent-pre-pull-20260426-1638` (44 files, +2551/-226). Brand/research/canvas/composer changes from a parallel agent. Need to rebase or selectively pop.
3. **Convert `lib/agent/multi.ts` → SessionManager** — currently uses raw Anthropic SDK loop. Port it through `lib/agent/managed/SessionManager` + log every tool step into `convex/runs.ts:109-289` with typed `ToolRef` provenance.
4. **Build AUTO MODE** — Ernie's killer demo feature. Spec in §9.
5. **Unblock berlayar.ai prod DNS** — apex A records are bound to a non-Workers Cloudflare property; both wrangler API and dashboard refuse to override. Manual delete in Cloudflare DNS panel is the only path. §7.

## 1. Repo state at handoff

```
cwd:                /Users/erniesg/code/erniesg/aether
branch:             main
HEAD:               c51e796 feat(agent/managed): land agentSession ledger + SessionManager (#101)
origin/main:        same commit (we're synced)
1-ahead local:      DROPPED by `git rebase --skip` (was 35cb062 fix: stabilize canvas composer p0s)
                    Assumed PR #120 covers it; verify if regressions appear.
stash:              stash@{0} = "wip-other-agent-pre-pull-20260426-1638"
                    44 modified files, includes infra/postiz/.env.postiz creation,
                    .gitignore edit (adds infra/postiz/.env.postiz),
                    brand/research/canvas/composer WIP from a parallel agent.
dev server:         next dev running on http://localhost:3002 (PID changes, find via `pgrep -fl 'next dev'`).
                    Reads .env.local and .dev.vars (Next picks up both).
```

**Untracked but live on disk** (created by previous agent, gitignored OR pulled from origin/main):

- `infra/postiz/.env.postiz` — **all 7 platform OAuth secrets**. NOT gitignored anymore (the .gitignore patch is in the stash). Add `infra/postiz/.env.postiz` to .gitignore before committing anything.
- `infra/postiz/{deploy.sh,service.yaml,cloudbuild.yaml,README.md,.env.postiz.example}` — pulled from origin/main during deploy.
- `lib/agent/multi.ts` — multi-tool agent (NEW, by previous agent).
- `app/api/agent/route.ts` — agent HTTP surface (NEW).
- `lib/providers/video/{types,gemini,registry}.ts` — Gemini video understanding (NEW).
- `app/api/video-understand/route.ts` — video API (NEW).
- `scripts/smoke-ig-post.mjs` — IG smoke test (NEW, dry-run by default).
- `public/icon.svg`, `public/icon-{256,300,512,1024}.png` — Berlayar/aether app icons.
- `.claude/` — Claude Code session metadata (was already there, untouched).

## 2. Infrastructure inventory

### GCP — `berlayar-postiz` project (account `ernietan.sg@gmail.com`)

```
Project ID:          berlayar-postiz
Project Number:      1047564447300
Billing account:     01942B-4DBBF2-395891 (open)
Region:              asia-southeast1
APIs enabled:        run, sqladmin, secretmanager, artifactregistry,
                     compute, servicenetworking, cloudbuild, vpcaccess
Cloud SQL:           postiz-pg (POSTGRES_16, ENTERPRISE edition, db-f1-micro)
                     instance connection: berlayar-postiz:asia-southeast1:postiz-pg
                     db: postiz, user: postiz (password rotated by deploy.sh)
Cloud Run:           service postiz, port 5000, 2GiB RAM, 2 CPU, CPU boost
                     URL: https://postiz-1047564447300.asia-southeast1.run.app
                     Latest revision: postiz-00006-sdl (or later)
Service account:     postiz-runner@berlayar-postiz.iam.gserviceaccount.com
                     Roles: cloudsql.client, secretmanager.secretAccessor
Artifact Registry:   postiz-mirror (remote mirror of ghcr.io)
                     image used: asia-southeast1-docker.pkg.dev/berlayar-postiz/postiz-mirror/gitroomhq/postiz-app:latest
Secret Manager:      18 secrets, all postiz-*
                     postiz-database-url        (Cloud SQL Unix-socket URL with localhost host)
                     postiz-redis-url           (Upstash rediss://)
                     postiz-jwt-secret          (64 hex)
                     postiz-backend-url         (public Cloud Run URL — used by FRONTEND_URL/NEXT_PUBLIC_BACKEND_URL)
                     postiz-backend-internal    (http://localhost:3000 — used by BACKEND_INTERNAL_URL)
                     postiz-{platform}-client-{id,secret} for instagram, facebook, x,
                     linkedin, tiktok, pinterest, youtube
Cloud Run env-vars:  MAIN_URL, NOT_SECURED=false, STORAGE_PROVIDER=local, IS_GENERAL=true
                     (MAIN_URL added in revision 00006 attempting to fix hydration; didn't help)
```

### Modal — `berlayar-ai` workspace

```
aether-sam3:           https://berlayar-ai--aether-sam3.modal.run        (existed before today)
aether-clip-cluster:   https://berlayar-ai--aether-clip-cluster.modal.run (deployed today, 2026-04-26)
secrets:               aether-sam3-secrets (CLIP token = aether-clip-cluster-secrets)
```

### Upstash — Redis for Postiz

```
Endpoint:    stunning-fowl-83501.upstash.io:6379
Region:      ap-southeast-1
Account:     ernietan.sg@gmail.com
URL:         rediss://default:<token>@stunning-fowl-83501.upstash.io:6379
```

### Cloudflare — `berlayar.ai` zone

```
Account:                5b25778cf6d9821373d913f5236e1606
Zone ID:                20dd33b49b5ac6c20f8fad90a8415e84
Workers deployed:       berlayar-prd (apex routing BLOCKED, see §7)
                        berlayar-stg → stg.berlayar.ai (LIVE, has /privacy + /terms + TikTok meta tag)
Pages projects (other): popbeatz, babysteps, erniesg (owns ernie.sg), my-astro-app
DNS blocker:            berlayar.ai apex A records 172.67.135.67 + 104.21.6.206 are
                        bound to a non-Workers Cloudflare property. wrangler API
                        rejects override even with override_existing_dns_record:true.
                        Manual delete required in Cloudflare DNS panel.
Wrangler auth:          OAuth token at ~/Library/Preferences/.wrangler/config/default.toml
                        Has workers:write but NOT zone:edit — cannot delete DNS via API.
```

### Convex — `careful-ermine-104` deployment (account `hello@ernie.sg`)

```
Production URL:  https://careful-ermine-104.convex.cloud
Site URL:        https://careful-ermine-104.convex.site
NEXT_PUBLIC_CONVEX_URL is set in .env.local
```

## 3. Secrets — where everything is

`infra/postiz/.env.postiz` (read it, but DO NOT print contents anywhere). Contains:

- All 7 platform OAuth client_id + client_secret pairs (instagram, facebook, x, linkedin, tiktok, pinterest, youtube)
- IG long-lived token + Business Account ID (`17841400858822908`, handle `ernie0529`) — works against `graph.instagram.com` (the IGAA-prefixed token format)
- TikTok sandbox creds (sbaw…)
- TikTok webhook verify token: `aether-ig-webhook-verify-2026`
- GCP project + region + Cloud Run service URL
- Postiz JWT secret + Redis URL

`.env.local` contains:

- ANTHROPIC, OPENAI, VOLCENGINE_ARK, REPLICATE, GOOGLE_GEMINI keys
- APIFY_API_TOKEN, RAPIDAPI_KEY (for live research)
- CLIP_MODAL_URL + CLIP_MODAL_TOKEN (for clustering)
- SAM3_MODAL_URL + SAM3_MODAL_TOKEN (for segmentation)
- NEXT_PUBLIC_CONVEX_URL

`.dev.vars` mirrors most of `.env.local` for `wrangler dev` / Cloudflare context.

## 4. What's been built today (LIVE & verified)

### CLIP clustering — Modal endpoint
- Deployed: `https://berlayar-ai--aether-clip-cluster.modal.run`
- Smoke-tested via curl: 6 unsplash images → 2 clusters + 1 noise, 52s cold start
- Wired into `/api/clusters/run` — works via the dev server
- Code: `modal/clip_cluster_app.py`

### berlayar.ai privacy + terms pages (staging only — prod blocked on DNS)
- Live at `https://stg.berlayar.ai/privacy` and `https://stg.berlayar.ai/terms`
- Same routes built for prod `berlayar-prd` Worker but custom-domain attach blocked
- TikTok domain verification meta tag in layout (content `Cedcok…NoxL`)
- Repo: `~/code/erniesg/berlayar` (separate from aether)

### Postiz Cloud Run
- Deployed at `https://postiz-1047564447300.asia-southeast1.run.app`
- All 3 PM2 services start (backend, frontend, orchestrator)
- Prisma migrations pass against Cloud SQL (after fixing `localhost` host placeholder for Unix-socket DSN)
- `/auth` HTTP 200, renders the Sign Up + Sign in with GitHub buttons
- **HYDRATION BUG persists** — see §6

### IG smoke test — `scripts/smoke-ig-post.mjs`
- Dry-run mode (default): creates IG media container, waits FINISHED, stops before publish.
- Live mode (`--live`): also posts.
- Smoke-tested in dry-run. Container `18581078317028628` reached FINISHED in ~7s.
- Uses the IGAA token (Instagram Login API) → `graph.instagram.com/v21.0`.

### Multi-tool agent — `lib/agent/multi.ts` + `app/api/agent/route.ts`
- Claude Opus 4.7 picks among 4 tools via `tool_choice: 'auto'` (NOT forced)
- Tools: `search_signals`, `cluster_references`, `generate_image`, `analyze_video`
- Each dispatches via `fetch` to the local `/api/*` route
- Smoke-tested: prompt "find 5 streetwear lookbook refs and cluster them" → Claude called `search_signals`, recognized result was 1 hashtag page (not 5 distinct posts), correctly *skipped* `cluster_references`, returned a useful summary. **Real agentic reasoning.**
- Max 6 iterations, prompt-cached system prompt.
- DOES NOT yet flow through `SessionManager` or log to the runs ledger — that's task #3 in §0.

### Video understanding — `lib/providers/video/*` + `/api/video-understand`
- Gemini 2.5 Flash adapter via `@google/genai`. Tasks: summarize, transcribe, extract-moments, describe-shots, free-form.
- Smoke-tested: 5s public sample mp4 → 21s real Gemini summary (urban park, calm mood, remix potential).
- Wired into the agent loop's `analyze_video` tool.

## 5. What's working in dev right now (the demo paths)

All of these respond on `http://localhost:3002` against live providers:

| Endpoint | What it does | Provider |
|---|---|---|
| `/api/research` POST | scrape IG/Pinterest/TikTok/XHS | Apify (live), RapidAPI |
| `/api/clusters/run` POST | CLIP embed + HDBSCAN cluster | Modal (live) |
| `/api/sketch-to-component` POST | sketch → SemanticCreativeComponent (#107) | Anthropic Opus |
| `/api/text-overlay/apply` POST | multilingual text planner (#90 + #113) | Anthropic Opus |
| `/api/segment` POST | face/object segmentation | SAM3 Modal |
| `/api/spatial` POST | gaussian splat / draft renderer | Replicate / Modal / draft |
| `/api/generate` POST | hero image render | OpenAI / Gemini / Replicate / Volcengine |
| `/api/video-understand` POST | Gemini video summarize/transcribe/etc | Gemini 2.5 Flash |
| `/api/agent` POST | multi-tool Opus loop | Anthropic Opus + above |
| `/api/publish/schedule` POST | schedule post via publisher seam | preview / postiz / SAU |

`scripts/smoke-ig-post.mjs` proves the IG publish chain end-to-end via direct Graph API.

## 6. Open bugs

### Postiz `/auth` hydration

**Symptom:** Sign Up form chrome renders, but a raw `<!DOCTYPE html><html>…` blob (the Next.js notFound boundary) is also visible as escaped text in the middle of the page. Form submits via GET, putting `email`, `password`, `company` in the URL query string. Hydration is broken.

**What was tried:**
- Set `BACKEND_INTERNAL_URL=http://localhost:3000` (was the public URL — fixed prisma boot, did not fix hydration)
- Set `MAIN_URL=https://postiz-1047564447300.asia-southeast1.run.app`
- Set `NOT_SECURED=false`, `STORAGE_PROVIDER=local`, `IS_GENERAL=true`

**Diagnosis:** `NEXT_PUBLIC_*` env vars are baked into the JS bundle at gitroomhq's CI build time, not at our runtime. The `gitroomhq/postiz-app:latest` image we mirror via Artifact Registry was built with whatever NEXT_PUBLIC_BACKEND_URL their CI sets (probably `http://localhost:5000`). When the user's browser loads our Cloud Run URL, the JS calls `http://localhost:5000` (their laptop, no Postiz there), fails hydration, falls through to native HTML form (which is GET).

**Fix paths (pick one):**

1. **Rebuild Postiz from source with our URL baked in** (~30 min):
   ```bash
   git clone https://github.com/gitroomhq/postiz-app.git /tmp/postiz-app
   cd /tmp/postiz-app
   docker buildx build --platform linux/amd64 \
     --build-arg NEXT_PUBLIC_BACKEND_URL=https://postiz-1047564447300.asia-southeast1.run.app \
     --build-arg NEXT_PUBLIC_FRONTEND_URL=https://postiz-1047564447300.asia-southeast1.run.app \
     -t asia-southeast1-docker.pkg.dev/berlayar-postiz/postiz-mirror/gitroomhq/postiz-app:berlayar \
     --push \
     .
   gcloud run services update postiz \
     --image=asia-southeast1-docker.pkg.dev/berlayar-postiz/postiz-mirror/gitroomhq/postiz-app:berlayar \
     --project=berlayar-postiz --region=asia-southeast1
   ```

2. **Investigate Postiz's runtime substitution script** — they may ship one in `/app/entrypoint.sh` or similar that does `sed` on `__NEXT_PUBLIC_BACKEND_URL__` placeholders. If so, find what env it expects and set it. `kubectl exec`-equivalent for Cloud Run: `gcloud run services proxy postiz` then SSH into the container.

3. **Skip Postiz UI for the demo, use direct Graph API smoke (`scripts/smoke-ig-post.mjs`)** for the publish claim. Postiz becomes useful only for the publish-lens UI; if Ernie ships the UI from inside aether instead, Postiz is bonus polish.

### berlayar.ai prod DNS

A records `172.67.135.67` and `104.21.6.206` at the apex are owned by another Cloudflare property (likely a Pages project on a different account, or a locked integration). API code 100117 even with `override_existing_dns_record:true`. The wrangler OAuth token has `workers:write` but not `zone:edit`. Manual delete in dashboard required:

```
https://dash.cloudflare.com/5b25778cf6d9821373d913f5236e1606/berlayar.ai/dns/records
→ delete the two apex A records → tell user → run `cd ~/code/erniesg/berlayar &&
pnpm exec opennextjs-cloudflare deploy --env=""` to attach prod custom domain
```

OR Ernie can create a new CF API token with `Zone:DNS:Edit` on `berlayar.ai` and paste it, and a future agent automates the delete. Same token doubles as the `CLOUDFLARE_API_TOKEN` for GitHub Actions deploy.

## 7. Branch + git hygiene

- Stay on `main`. Don't force-push.
- Before committing: `git check-ignore -v infra/postiz/.env.postiz` — if not ignored, add it to .gitignore (line `infra/postiz/.env.postiz`) BEFORE staging anything else.
- The 1-ahead local commit `35cb062 fix: stabilize canvas composer p0s` was DROPPED by `rebase --skip`. PR #120 is assumed to cover the same ground (tldraw license + drag-drop + stale runs + opaque flyouts). If regressions appear at runtime, recover via `git reflog` and `git cherry-pick`.
- The stash holds the parallel agent's brand/research/canvas WIP. After `git stash pop`, expect conflicts in `lib/research/signals.ts`, `app/api/research/route.ts`, `lib/brand/*`, components/rail/sections/{Brand,Offer,Campaign}Section.tsx`. Resolve carefully — that work is real research orchestrator improvements you probably want.

## 8. Task #3 — Convert multi.ts to SessionManager + ledger

`lib/agent/managed/SessionManager` exists (PR #101). Currently `lib/agent/multi.ts` uses raw `client.messages.create` in a while-loop. Mechanical port:

1. Read `lib/agent/managed/SessionManager.ts` to learn its interface (likely takes tools, initial messages, returns a session you can step).
2. Replace the `while (iter < maxIter)` block with `session.run()` (or whatever the API is).
3. Per-tool dispatch should call `convex/runs.ts:109-289` to log each step with `entryRef`, `tool`, `provider`, `model`, `inputs`, `outputs`, `beforeSnapshotRef`, `afterSnapshotRef`. Look at how `runGenerate` in `lib/agent/generate.ts` writes its run — copy that pattern.
4. Each tool's `entryRef` comes from `lib/tool/registry.ts` via `resolveToolEntryRef('search_signals')` etc. Add registry entries for the agent-loop tools if they don't exist — match `outputKind` carefully.
5. Smoke-test: run `/api/agent` against the same prompt, then verify `convex/runs` has N rows (one per tool call) with proper provenance. Use the Convex dashboard at `https://dashboard.convex.dev/d/careful-ermine-104` to inspect.
6. UPDATE the agent route to also pass `workspaceId` so the runs are scoped properly.

**Definition of done:** `/api/agent` smoke returns same shape, `convex/runs` table now has one row per tool step, each row has typed `ToolRef` matching `lib/tool/registry.ts`. Right rail of the workspace UI (the "ledger") starts populating with agent steps automatically.

## 9. Task #4 — AUTO MODE feature

Ernie's spec, in his words: "drop in a URL or some files, and it does the whole lap from research+selection/critique → generate visuals w text → multiple formats and suggest how to schedule. Let us decide how many campaign variations we'd like to see. Once everything is done we just get a notif and decide whether to schedule or not, or automatically post (if turned on)."

### UX

- **Workspace-level toggle** — `Auto Mode` chip in the canvas chrome (lives next to the floating toolbar; off by default). When ON, dropping a URL or files into the canvas triggers the lap.
- **Configuration popover** when the toggle is clicked: "How many campaign variations?" (1-4 input), "When done: notify me / schedule for review / auto-post". Last selection persists per workspace.
- **Progress strip** in the right rail (output/metadata zone) — shows the current step in the lap with timestamps. Steps: Research → Critique → Compose → Render → Translate → Schedule. Each step renders a small artifact preview when it finishes.
- **Notification** when the lap completes:
  - If "notify me": Discord webhook ping (env: `DISCORD_WEBHOOK_URL`, see `docs/DISCORD-SETUP.md`) + in-app banner.
  - If "schedule for review": rail shows scheduled posts in `pending-review` state.
  - If "auto-post": fires through the publisher seam directly.

### Backend orchestrator

New file `lib/agent/auto-mode.ts`:

```ts
export interface AutoModeRequest {
  workspaceId: Id<'workspaces'>;
  trigger: { kind: 'url' | 'file'; payload: string }; // url string OR file ref
  variationCount: 1 | 2 | 3 | 4;
  notifyMode: 'notify' | 'review' | 'auto-post';
  brandContext?: BrandContext; // pulled from creator-store if absent
  formatTargets?: FormatTarget[]; // defaults from workspace prefs
}

export interface AutoModeResult {
  variations: Array<{
    references: ReferenceRecord[];
    selected: ReferenceRecord[]; // top-K after critique
    component: SemanticCreativeComponent;
    heroAsset: ImageGenResult;
    cropFanout: Record<FormatToken, ImageGenResult>;
    overlays: ProposedTextOverlay[]; // multilingual
    scheduleSuggestion: { platform: PublishPlatform; whenLocal: string }[];
  }>;
  ledger: AgentSession[]; // one per variation
}

export async function runAutoMode(req: AutoModeRequest): Promise<AutoModeResult>;
```

Implementation outline:
1. **Resolve trigger** — if URL, fetch + extract intent (Gemini for video URLs, OG-tag scrape for web URLs). If files, classify image vs video and route to `/api/research` or `/api/video-understand` for context.
2. **For each of N variations**, run a SessionManager session with these tools enabled: `search_signals`, `cluster_references`, `propose_creative_component`, `generate_image`, `apply_text_overlay`, `analyze_video`. Use a system prompt that says "produce variation #i of N — make this distinct from the others by ${variation-of-mood-or-palette}".
3. **Critique step** — after `search_signals` returns refs, run a small Opus call to score and pick the top 3-5. Log selection to ledger.
4. **Hero + fan-out** — call `/api/generate` with `aspectRatioOverride` for each `formatTarget`. Existing crop-from-hero logic (#106/#125) handles linked artboards.
5. **Multilingual overlays** — `apply_text_overlay` with all 4 SG locales (en, zh-Hans-SG, ms-SG, ta-SG). Existing planner does the rest.
6. **Schedule suggestions** — per platform, compute next reasonable post time using the schedule-pack heuristic in `lib/publisher/schedule.ts` (or write one; pattern: Mon/Wed/Fri 9am SGT for IG, daily for X, etc.).
7. **Persist** — write everything as a `Campaign` row in Convex (new table?) — variations are children. Each variation's renders + overlays are scoped to a `frame` in the workspace canvas.
8. **Notify** — `notifyMode === 'notify'` → Discord webhook + in-app banner. `'review'` → mark all variations as `pending-review`. `'auto-post'` → call `/api/publish/schedule` for each suggestion.

### API surface

- `POST /api/auto-mode/run` — kicks off the orchestrator, returns the campaign ID, streams progress via SSE (mirror `/api/generate` SSE pattern).
- `GET /api/auto-mode/:campaignId` — current state for the rail.
- `POST /api/auto-mode/:campaignId/decide` — `{ action: 'schedule' | 'discard', variationId }`.

### UI files to add or extend

- `components/canvas/AutoModeToggle.tsx` — the toggle + config popover
- `components/right-rail/sections/AutoModeProgressSection.tsx` — the progress strip
- `lib/auto-mode/orchestrator.ts` — the SSE-streamed orchestrator (server)
- `convex/campaigns.ts` — Convex schema + mutations for `campaigns` and `campaignVariations`

### What "done" looks like

- Toggle on, drop a URL into the composer, set 3 variations + notify-me. ~2 min later, Discord pings, right rail shows 3 distinct campaigns each with hero + 4 format crops + 4-locale text overlays, with one suggested schedule entry per platform per variation. Click schedule → goes through publisher seam.
- Auto-post mode: same flow, but after lap completes, posts go straight to Postiz / preview adapter without the user clicking schedule.

## 10. Smoke test commands

```bash
# Aether dev server (already running on :3002)
curl -sS http://localhost:3002/health

# Live research (real IG via Apify)
curl -sS -X POST http://localhost:3002/api/research \
  -H "Content-Type: application/json" \
  -d '{"seedText":"streetwear lookbook","platforms":["instagram"],"limit":12}'

# Live clustering (real CLIP via Modal)
curl -sS -X POST http://localhost:3002/api/clusters/run \
  -H "Content-Type: application/json" \
  -d '{"images":[{"id":"a","url":"https://images.unsplash.com/photo-1493612276216-ee3925520721?w=400"},{"id":"b","url":"https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400"}],"minClusterSize":2}'

# Video understanding (Gemini 2.5 Flash)
curl -sS -X POST http://localhost:3002/api/video-understand \
  -H "Content-Type: application/json" \
  -d '{"videoUrl":"https://download.samplelib.com/mp4/sample-5s.mp4","task":"summarize"}'

# Multi-tool agent
curl -sS -X POST http://localhost:3002/api/agent \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Find 5 streetwear lookbook refs on instagram, then cluster them."}'

# IG smoke (dry-run — no actual post)
node scripts/smoke-ig-post.mjs
node scripts/smoke-ig-post.mjs --live   # actually posts to @ernie0529

# Postiz container logs
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="postiz"' \
  --project=berlayar-postiz --limit=50 --format='value(timestamp,textPayload)' --order=desc

# Postiz auth page
curl -sSL -o /dev/null -w "HTTP %{http_code}\n" \
  https://postiz-1047564447300.asia-southeast1.run.app/auth
```

## 11. Hard rules (don't break)

(Per `CLAUDE.md` and `AGENTS.md` — read both before editing UI):

1. **Single synthesis-shell workspace.** Don't split into per-step wizard routes.
2. **Strict UI taxonomy** — left rail = input, right rail = output+metadata, canvas chrome = tool, header = navigation.
3. **Prompt composer at the bottom**, scope chip explicit.
4. **Progressive disclosure** — collapsed by default.
5. **Restraint over labels** — layout + mono + paper carry meaning, not paragraphs.
6. **Provider-agnostic AI** — no hardcoded default model.
7. **Typed provenance on every action** — every state mutation logs `ToolRef` / `SkillRef` / `WorkflowRef`.
8. **Graph-first persistence (Convex)** — derived state never in payload.
9. **Red/green TDD** — failing test first, then minimal code.

## 12. Final report (when you're done)

Bullet what shipped per task, smoke-test counts before/after, PR URLs, and verdict per task:
- **Postiz hydration:** READY / READY-WITH-MANUAL-OPS / BLOCKED-BY-UPSTREAM (rebuild from source paths)
- **Stash recovery:** INTEGRATED / SELECTIVELY-INTEGRATED / DEFERRED
- **SessionManager port:** READY / PARTIAL
- **Auto Mode:** READY (full lap demo-able) / PARTIAL (which steps work) / BLOCKED
- **Prod DNS:** READY / WAITING-ON-ERNIE-DASHBOARD-CLICK

Honest only. Synthetic-fallback paths and mock-only tests don't count as `READY` for Ernie.

---

**Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>**
