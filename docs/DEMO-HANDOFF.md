# Aether — demo recording handoff

Self-contained briefing. Copy-paste the section below into a fresh Claude Code
session at the repo root (`/Users/erniesg/code/erniesg/aether`). The session
that wrote this just shipped the toggle, cluster wiring, and full lap
inspection — that work is done. This is now a recording-the-demo task, not
an implementation task.

---

## Briefing prompt (copy from here ↓)

You are taking over from a previous session. The repo is `aether` at
`/Users/erniesg/code/erniesg/aether`. Read `CLAUDE.md` and `AGENTS.md` first —
those carry the product framing and hard rules that override anything below.

**Today's date: 2026-04-27.** Demo recording is the goal of this session.
The implementation work is done; you are recording, not building (unless a
real bug surfaces).

### What's already shipped that the demo needs to show

The demo follows this voiceover script verbatim. Every claim in it has a
corresponding feature in the codebase as of HEAD:

> All a user has to do is drop in references or prompts. Opus turns inputs
> into meaningful creative components. The generated key visual is
> automatically propagated into desired formats. With automated multilingual
> translations in the 4 official languages of Singapore. Everything — key
> visual, text, meaning — is adaptive: smart placement keeps text free of
> brand names and faces. Everything is editable, with global / local scope.
>
> Aether turns Opus 4.7 into a collaborator. You can type or talk to it.
>
> [Under the Hood / Opus 4.7 / Managed Agents]
> Claude Managed Agents fan out the competitor analysis, cluster like
> visuals together (labelled), riff off the concept, hit generate, get
> multiformat / multilingual adaptations for free.
>
> When ready, Aether pings the human-in-the-loop for signoff and
> scheduling. Posts are scheduled with Claude Managed Agents.
>
> If you're feeling YOLO, turn on auto-mode and let Opus cook.

### Where each capability lives in code

| Voiceover beat | What to point the camera at | File / surface |
|---|---|---|
| "Drop a URL" | Canvas drop target accepts URL paste | `components/workspace/WorkspaceShell.tsx fireAutoModeLap` |
| "Type or talk" | Voice orb on canvas chrome + prompt composer | `components/canvas/VoiceOrb.tsx`, `components/composer/PromptComposer.tsx` |
| "Auto-mode toggle" | `auto · on` chip top-right, popover with `Managed Agents` toggle | `components/canvas/AutoModeToggle.tsx` |
| "Managed Agents fan out research" | Right rail `research` chip → expand for competitors / locale insights / source URLs | `lib/agent/managed/research.ts` → `components/rail/sections/AutoModePanel.tsx ResearchSignalsSection` |
| "Cluster visuals together" | Right rail `clusters` chip → expand for cluster labels + tags | `lib/agent/managed/cluster.ts` → `ClusterSection` |
| "Multiformat adaptation" | 4 format frames on canvas, mask-aware crop | `lib/auto-mode/canvas.ts ensureFormatFrames` + `lib/text-overlay/compose.ts cropAndResize` |
| "4 SG languages" | Atlas tile (Discord embed) is 4 formats × 4 locales | `lib/text-overlay/compose.ts composeVariantSet` |
| "Smart placement" | SAM3 forbidden regions visible in inspect | `lib/agent/segment-subjects.ts` → `/inspect mask dedup chips` |
| "Global / local scope" | Edit headline → propagates across frames OR stays local | `lib/auto-mode/canvas.ts buildGlobalTextPropagator` |
| "Signoff + scheduling" | Lap-end Discord embed → approve buttons OR auto-post pings | `lib/agent/managed/signoff.ts` → Discord channel |
| "Live debug" | Right rail `lap log` chip → expand for events. `↗ inspect` link opens full timeline | `lib/agent/lap-logger.ts` → `LapEventLog` + `/inspect/[campaignId]` |

### Pre-recording setup

1. **Provision the three Managed Agents** (one-time, idempotent):
   ```bash
   npm run provision:managed-agents
   ```
   Creates `aether-research`, `aether-cluster`, `aether-signoff` + a shared
   environment, writes IDs into `.dev.vars`. Re-run with `--force` to recreate.

2. **Confirm `.dev.vars` has** (rotate the SerpAPI key after recording — it's
   exposed in the project chat history):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_RESEARCH_AGENT_ID=agt_...
   ANTHROPIC_RESEARCH_ENVIRONMENT_ID=env_...
   ANTHROPIC_CLUSTER_AGENT_ID=agt_...
   ANTHROPIC_CLUSTER_ENVIRONMENT_ID=env_...
   ANTHROPIC_SIGNOFF_AGENT_ID=agt_...
   ANTHROPIC_SIGNOFF_ENVIRONMENT_ID=env_...
   SERPAPI_KEY=...
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   AUTO_MODE_USE_SIGNOFF=1
   NEXT_PUBLIC_CONVEX_URL=https://...convex.cloud
   ```

3. **Start Convex + dev server**:
   ```bash
   npx convex dev          # in one terminal — schema sync
   npm run dev             # in another — Next.js on :3000
   ```

4. **Open Discord channel** the webhook posts to. You want this visible in
   the screen capture so the voiceover can reference live pings.

### Recording layout (what should be on screen)

Three-pane setup, recorded as one capture:

```
┌─────────────────────────────────────────┬─────────────────┐
│                                         │                 │
│  Aether workspace (browser)             │  Discord channel│
│  http://localhost:3000/workspace        │  (webhook chan) │
│                                         │                 │
│  Right rail visible (research /         │                 │
│  clusters / lap log chips)              │                 │
│                                         │                 │
├─────────────────────────────────────────┤                 │
│                                         │                 │
│  /inspect/[campaignId] (browser tab     │                 │
│  opened mid-demo via the ↗ inspect      │                 │
│  link in the right rail)                │                 │
│                                         │                 │
└─────────────────────────────────────────┴─────────────────┘
```

Use macOS QuickTime → New Screen Recording, "Record selected portion" so
you can capture browser+Discord as one frame.

### The demo arc — 90 seconds

| Time | Action | What the camera sees |
|---|---|---|
| 0:00 | Open `http://localhost:3000/workspace` | Empty canvas, auto-mode toggle off |
| 0:05 | Click `auto · off` → popover opens. Confirm `Managed Agents` chip is solid (on). Set notify mode to `auto-post`. | Popover with all four chips visible |
| 0:15 | Drop URL `https://www.eightsleep.com/` onto canvas | Lap starts. Right rail flips to `lap · running`. |
| 0:20 | Right rail shows `research` chip with counts. Expand. | Competitor chips, locale insight bullets, source URLs |
| 0:35 | `clusters` chip appears. Expand. | Cluster labels with tags |
| 0:45 | `lap log` chip ticks events: `ingest.url.ok`, `serp.enriched`, `research.ok`, `cluster.ok`, `variation.ready` | Events scroll live |
| 0:55 | Cut to Discord — lap-start ping, then per-variation embeds with hero images, then `signoff-hold-vN` pings with rationale | Discord channel in side pane |
| 1:05 | Cut back to canvas — variations populate the 4 format frames at correct aspect ratios, with text overlays in en-SG | 4 frames each with hero + caption |
| 1:15 | Click `↗ inspect` in right rail header → /inspect opens in new tab | Full lap timeline, atlas thumbnails, schedule plan |
| 1:25 | Toggle locale chip in right rail to zh-Hans-SG → text overlays update (no mid-word breaks thanks to jieba) | Chinese caption renders cleanly |

### Smoke checklist (run before recording)

```bash
# 1. Tests still green (1413 passing baseline)
npm test

# 2. Typecheck clean (8 pre-existing endCall errors are noise, ignore)
npm run typecheck

# 3. Provision agents (one-time)
npm run provision:managed-agents

# 4. Convex deployed
npx convex dev    # leave running

# 5. Dev server
npm run dev       # leave running

# 6. Smoke fire — drop a URL, confirm the right rail comes alive
#    Open http://localhost:3000/workspace
#    Set auto-mode → on, notify → review (safer for first take), 2 variations
#    Drop https://www.eightsleep.com/
#    Watch for: lap-start ping → research chip → cluster chip → variation
#    cards → /inspect deep link works
```

### Commands you'll likely need

```bash
# Re-provision agents if a system prompt changes
npm run provision:managed-agents -- --force

# Reset a stuck Convex campaign (if a previous lap left dangling state)
# Easiest: open the workspace in a fresh private window (clears in-flight id)

# Fire a CRC simulation for the X webhook (so the receiver flow shows in
# Discord during the conversation-monitoring beat — optional)
curl 'http://localhost:3000/api/webhooks/x?crc_token=test123'

# Send a fake reply event (proves inbound webhook plumbing is real)
curl -X POST http://localhost:3000/api/webhooks/x \
  -H 'content-type: application/json' \
  -d '{"tweet_create_events":[{"id_str":"123","in_reply_to_status_id_str":"posted_post_id","text":"This is amazing!","user":{"screen_name":"test_user"}}]}'
```

### Known caveats — don't be surprised by these on camera

1. **Lap doesn't stream live updates today.** `runAutoMode` returns one
   response at the end. The right rail goes live after the API resolves —
   variations / research / cluster all appear at lap-end, not progressively.
   Voiceover should match this: "Aether spins up the research, clusters, and
   variations" rather than "watch the research come in."

2. **Cluster agent only fires when ≥2 distinct ref images are on the page.**
   Eight Sleep homepage has plenty (og:image + body img tags + SerpAPI
   fallback images). Tested. If you swap to a different URL with sparse
   imagery, expect cluster section to be absent.

3. **`AUTO_MODE_NATIVE_PER_FORMAT` flag is OPT-IN.** Default is mask-aware
   crop from the 1:1 hero. If you want to flex 4× native renders for the
   demo, set the flag. Quality bar is fine either way; default is faster.

4. **Discord `signoff-hold-*` pings only fire when `AUTO_MODE_USE_SIGNOFF=1`
   AND `notifyMode='auto-post'`.** For the demo arc, set both — the held-
   for-review variations are visually compelling because they show the
   agent rejecting borderline copy with rationale.

5. **The X webhook receiver works but isn't subscribed to live X events.**
   Use the `curl` commands above to simulate inbound replies if the
   conversation-monitoring beat is in your edit. Real X subscription needs
   the dev portal flow (see `docs/DEMO-HANDOFF.md` step in 7a7916d's commit
   message).

### Your first task

1. Run the smoke checklist top to bottom. Report blockers.
2. Once smoke passes, do ONE end-to-end take with `notifyMode=review` (safer
   than auto-post — no real social posts go out).
3. After that take, switch to `auto-post` + `forcePostNow=1` env and do
   one take of the publishing beat.
4. Report back with: take 1 stopwatch time, take 2 stopwatch time, any
   surprising visuals, and anything that NEEDS to be fixed before recording
   the master cut.

DO NOT modify production code unless a smoke step actually fails. If
something looks wrong, ask first — the previous session shipped a lot, and
not every behavior may match a stale memory of the codebase.

### Scope of authorized changes

- **Yes**: voice-over polish, demo URL changes, cosmetic right-rail tweaks
  if a chip wraps badly, fixture seeding for `?demo=eightsleep` if needed.
- **No**: rewriting `runAutoMode`, touching the multi-aspect refactor,
  reshaping persistence, changing the toggle. The structure is final.

### What's in the right-rail panel right now

The `auto mode` section in the right rail (when a campaign is in flight or
just completed) renders, in order:
1. Status header with `↗ inspect` deep link
2. Step timeline (chips: ingest → vision → generate → compose → publish)
3. **Research signals** chip → expands to competitors / locale insights / sources
4. **Clusters** chip → expands to grouped reference images with labels + tags
5. **Lap log** chip → expands to live event tail with timestamps + tags
6. Per-variation cards (status / approve / reject / schedule)

Each chip is collapsed by default per CLAUDE.md hard rule #5 (progressive
disclosure). Click to expand.
