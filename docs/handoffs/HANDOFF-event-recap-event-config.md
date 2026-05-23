# Handoff: `feat/event-recap-event-config` — validation + smoke test

## What this PR ships

Eleven TDD slices (commits `7e95dc61`..`74058927`) lift every AIE-2026-specific hardcoded constant into typed per-event config, add an HITL state machine + REST surface, make the worker embeddable on third-party sites, and wire a daily cron refresh. **152 tests across 26 files, all green; typecheck clean.**

Branch: `feat/event-recap-event-config` from `codex/event-recap-tinyfish`.

| Commit | Slice | What |
|---|---|---|
| `7e95dc61` | 1 | `EventConfig` type + loader + skeleton fixture |
| `1ddf0503` | 2 | `STORY_DEFINITIONS` + overrides + merge targets → fixture; `buildStoryAssignedThemes` accepts config |
| `7e366c58` | 3 | `CORPUS_PHRASE_RULES` + `SINGLE_TOKEN_ENTITY_ALLOWLIST` parameterized |
| `9bb14476` | 4 | `CURATED_THEME_COPY` + `isIncidentalAieMention` parameterized |
| `fa404c0f` | 5 | Atlas lanes extracted to `lib/research/event-recap/atlas.ts`; lane matchers in fixture |
| `fa87b026` | 6 | HITL state machine (5 junctures, audit log, full-auto + HITL paths) — pure data lib |
| `3b55c0d0` | 7 | Worker embed headers (CSP + CORS + theme), cron config, `/embed-snippet` route |
| `e0979334` | 8 | Convex `eventConfig` table + `serializeEventConfig`/`deserializeEventConfig` |
| `324dae81` | 9 | Generic per-event worker (`workers/event-recap-vibes.ts`) for non-AIE events |
| `ac8e125e` | 10 | HITL Convex persistence + `/api/events/:eventId/runs/:runId/junctures` REST API |
| `74058927` | 11 | Worker cron handler → POSTs to `/api/events/aie-2026/refresh` |

Playbook docs at `docs/playbooks/event-recap/` (separate branch `skill/event-recap-playbook`) describe the full workflow.

---

## Your validation task

You're picking this up to validate that the changes work end-to-end. Three layers to verify:

### Layer 1 — Tests + typecheck (5 min)

```bash
cd /Users/erniesg/code/erniesg/aether
git checkout feat/event-recap-event-config
npx vitest run lib/research/event-recap/ 2>&1 | tail -6
# Expect: Test Files 26 passed, Tests 152 passed

npx tsc --noEmit --project tsconfig.json
# Expect: no output, exit code 0
```

If either fails, the rest is moot — flag back.

### Layer 2 — Local worker smoke (10 min)

```bash
# Start the AIE worker locally
npx wrangler dev --config wrangler.aie2026.jsonc --port 8788 --local > /tmp/aie-worker.log 2>&1 &
sleep 12
tail -5 /tmp/aie-worker.log  # confirm: "[wrangler:info] Ready on http://localhost:8788"

# Smoke each route:

# 1. HTML page with light theme (default for standalone)
curl -sI http://localhost:8788/vibes/aie2026 | head -8
# Expect: 200 OK
# Content-Security-Policy: frame-ancestors 'self' https://ai.engineer https://www.ai.engineer https://*.ai.engineer ...

# 2. Dark theme switch
curl -s "http://localhost:8788/vibes/aie2026?theme=dark" | grep -E 'data-theme|color-scheme' | head -2
# Expect: <html lang="en" data-theme="dark"> ... color-scheme:dark;--bg:#0c0a08;...

# 3. Light theme switch
curl -s "http://localhost:8788/vibes/aie2026?theme=light" | grep -E 'data-theme|color-scheme' | head -2
# Expect: <html lang="en" data-theme="light"> ... color-scheme:light;--bg:#fbfaf7;...

# 4. Embed snippet route
curl -s http://localhost:8788/vibes/aie2026/embed-snippet
# Expect: <iframe src="..." title="AI Engineer Singapore 2026 — Recap" height="900" ...>

# 5. CORS on data endpoint — known gap on AIE-specific worker; verify with generic worker (Layer 3)

# Stop the worker
pkill -f "wrangler dev"
```

### Layer 3 — Generic worker smoke (5 min)

The new generic worker (`workers/event-recap-vibes.ts`) hasn't been deployed to a route yet, but you can smoke it locally with a temporary wrangler config:

```bash
# Create a temporary wrangler config for the generic worker
cat > /tmp/wrangler.generic.jsonc <<'EOF'
{
  "name": "aether-event-recap-generic-dev",
  "main": "workers/event-recap-vibes.ts",
  "compatibility_date": "2026-02-28",
  "compatibility_flags": ["nodejs_compat"],
  "r2_buckets": [
    {
      "binding": "AETHER_ASSETS",
      "bucket_name": "aether-assets",
      "preview_bucket_name": "aether-assets"
    }
  ]
}
EOF

npx wrangler dev --config /tmp/wrangler.generic.jsonc --port 8789 --local > /tmp/generic-worker.log 2>&1 &
sleep 10
tail -5 /tmp/generic-worker.log  # confirm Ready on http://localhost:8789

# Verify path validation rejects unsafe eventIds
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8789/vibes/../etc/passwd"
# Expect: 404

curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8789/vibes/foo%20bar"
# Expect: 404 (space in eventId is rejected by isValidEventId)

# Verify a real-looking eventId returns the minimal shell
curl -s "http://localhost:8789/vibes/test-event-2026" | grep -E '<title>|data-theme'
# Expect: <title>test-event-2026 — recap</title> + data-theme="light"

# Embed snippet for any event id
curl -s "http://localhost:8789/vibes/test-event-2026/embed-snippet"
# Expect: <iframe src="http://aether.berlayar.ai/vibes/test-event-2026?theme=dark" ...

# CORS headers on the data endpoint
curl -sI "http://localhost:8789/vibes/test-event-2026/data" | grep -iE 'access-control|content-security'
# Expect: Access-Control-Allow-Origin: * (the data route on the GENERIC worker has CORS)

pkill -f "wrangler dev"
```

### Layer 4 — Playbook smoke (3 min)

The skill playbook (separate branch) should be readable:

```bash
git fetch origin
ls -la docs/playbooks/event-recap/ 2>/dev/null || echo "playbook lives on skill/event-recap-playbook branch — check that branch separately"

# Also verify the user-level Claude Code shim:
cat ~/.claude/skills/event-recap/SKILL.md 2>/dev/null | head -5
# Expect: short pointer to the canonical playbook location
```

---

## What to verify visually (if you can open a browser)

1. **Dark theme inside an iframe** — confirms the embed works:
   ```bash
   cat > /tmp/embed-smoke.html <<'EOF'
   <!doctype html>
   <html><head><title>embed smoke</title></head>
   <body style="background:#000;color:#fff;font-family:sans-serif;padding:24px">
     <h1>iframe embed of AIE 2026 recap</h1>
     <iframe src="http://localhost:8788/vibes/aie2026?theme=dark" width="100%" height="800" style="border:0;background:#0c0a08"></iframe>
   </body></html>
   EOF
   open /tmp/embed-smoke.html  # macOS
   # In another shell, start the AIE worker per Layer 2
   ```
   Verify: the iframe loads with the dark palette; no CSP error in browser DevTools console.

2. **Theme parity** — load both `?theme=dark` and `?theme=light` URLs in separate tabs; the data-theme attribute on `<html>` should reflect the param, and the CSS variables should differ.

---

## AIE site investigation (concrete evidence)

Pulled `https://www.ai.engineer/singapore/2026` directly:
- **Stack**: Next.js on Vercel (`server: Vercel`, `x-nextjs-rewritten-path: /singapore`)
- **Headers**: `access-control-allow-origin: *`. No `X-Frame-Options`, no CSP, no COEP/COOP — host page won't block our iframe.
- **Body bg**: `#070808` — dark-themed. Our dark theme palette now matches.
- **Fonts** (Google Fonts): `Inter` (primary sans), `Instrument Sans`, `Instrument Serif`, `Inconsolata`, `JetBrains Mono`, `Azeret Mono`. Our dark theme now loads `Inter` + `Instrument Serif` + `JetBrains Mono` from the same Google Fonts CDN.
- **Existing iframe pattern**: Tessera ticket checkout — `sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation allow-forms"`, `loading="lazy"`. AIE site is comfortable with permissive-sandbox iframes.
- **Section structure**: About → Tracks → Speakers → Sponsors → Schedule → Venue → Tickets. Recap would land between Schedule and Venue, or after Tickets (post-event).

## CORS story end-to-end

| Use case | CORS needed? | Status |
|---|---|---|
| iframe embed on ai.engineer (HTML + same-origin /data fetch from inside iframe) | No | ✓ works |
| iframe loads + parent JS reads CSP via DevTools | n/a | ✓ frame-ancestors set |
| AIE site's JS does `fetch('https://aether.berlayar.ai/vibes/aie2026/data')` cross-origin | Yes | ✓ AIE worker now emits `Access-Control-Allow-Origin: *` on /data + /media + error responses |
| Other domain embeds via iframe | No (same as above) | ✓ frame-ancestors allowlist covers ai.engineer + *.ai.engineer + berlayar.ai + *.berlayar.ai |
| postMessage between iframe and parent for resize/event passing | Not CORS — needs JS on both sides | Not implemented (future enhancement if needed) |

## Known gaps (intentional — not bugs)

These were called out in the PR notes and are NOT regressions:

1. **AIE worker's dark theme is variable-rebind only** — the CSS custom properties switch but a few cards (`.wall`, `.cluster-card`) may still show light-palette bleed. Body bg matches AIE's `#070808`; fonts match AIE's Google Fonts stack. A CSS audit pass for component-level dark palette is queued.
3. **Cron→refresh requires `VIBES_REFRESH_API_KEY` wrangler secret** — the scheduled handler skips cleanly if absent and logs `aie2026-vibes.scheduled.skipped`. To enable:
   ```bash
   wrangler secret put VIBES_REFRESH_API_KEY --config wrangler.aie2026.jsonc
   # paste a vibes_-prefixed API key generated from the workspace
   ```
4. **Convex `eventConfig` table is empty** — `setConvexConfigSource()` wires a Convex-backed loader, but no row has been put yet. Use `convex/eventConfig.ts:put` to upload the AIE 2026 config (or any new event):
   ```ts
   import { serializeEventConfig } from '@/lib/research/event-recap/event-config-serialize';
   import aie2026 from '@/lib/research/event-recap/fixtures/aie-2026.config';
   const serialized = serializeEventConfig(aie2026);
   await client.mutation(api.eventConfig.put, { eventId: 'aie-2026', data: serialized, updatedBy: 'system' });
   ```
5. **HITL UI** — the REST endpoints + Convex mutations exist but no workspace UI yet renders the pause-resume affordances. CLI-only for now.
6. **`scheduled` triggers don't fire in `wrangler dev --local`** — you'll see a warning at startup; manually invoke via `curl "http://localhost:8788/cdn-cgi/handler/scheduled"` if you want to exercise the cron path locally.

---

## Failure modes to flag back

- Any test failure in `lib/research/event-recap/`
- TypeScript errors in any of the new files
- A route returning the wrong HTTP status (e.g., HTML route returning 500 instead of 200)
- CSP header missing on the HTML response (the AIE embed depends on it)
- Theme switching not working (likely a renderHtml bug)
- The generic worker rejecting valid kebab-case eventIds (`isValidEventId` regression)

If any of those: paste the failing output + the commit SHA you tested.

---

## If you want to dig deeper

- **Test the full TDD red→green by reverting a commit and running tests**: `git revert HEAD~1 --no-commit && npx vitest run lib/research/event-recap/` should show a failure that the revert reintroduces.
- **Test the state machine directly**:
  ```ts
  import { createRecapRunState, requestJunctureApproval, recordJunctureDecision } from '@/lib/research/event-recap/recap-run-state';
  let s = createRecapRunState({ eventId: 'demo', runId: 'r1', mode: 'hitl' });
  s = requestJunctureApproval(s, 'A', { theses: ['T1'] });
  s = recordJunctureDecision(s, 'A', 'approved', 'looks good', 'reviewer');
  console.log(s.currentJuncture);  // 'B'
  ```
- **Test the parameterization**: load the AIE fixture + pass it to `buildStoryAssignedThemes` for an event called `demo-2027`; verify all 13 stories still match expected posts.

---

## Where to ship the PR description from

Use the per-slice commit messages — they were written specifically as PR body fodder. `git log feat/event-recap-event-config ^codex/event-recap-tinyfish --format="%B" > /tmp/pr-body.md` gives you the raw bullet content; structure it into the PR description.

Branch base for PR: `codex/event-recap-tinyfish` (or `main` if `codex/event-recap-tinyfish` has already merged).
