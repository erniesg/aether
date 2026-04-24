# Discord human-review setup

One-time ops work that pairs with `lib/route-human/discord.ts` +
`app/api/route-human/discord-interaction/route.ts`. After this is wired up,
`ready-for-ernie` notifications fan out to Discord and the four action
buttons drive the GitHub PR state machine end-to-end.

This setup is **not** agent work. Claude ships the code; Ernie clicks
through the portal once.

## 1 · Create the server and channel

1. Create a personal Discord server (or pick an existing one).
2. Add a text channel: `#aether-review`.
3. Server-side: **Integrations → Webhooks → New Webhook** in that channel.
   - Name: `aether reviewer`.
   - Copy the webhook URL — this is `DISCORD_WEBHOOK_URL`.

## 2 · Create a Discord application

1. https://discord.com/developers/applications → **New Application**. Name
   it `aether`.
2. On the app's **General Information** page:
   - `Application ID` → `DISCORD_APPLICATION_ID`.
   - `Public Key` → `DISCORD_PUBLIC_KEY` (hex, 64 chars).
3. Under **Installation** make sure the `Guilds → Applications.Commands`
   scope is selectable, and install the app into the server from step 1.
4. Under **General Information → Interactions Endpoint URL**, set:

   ```
   https://aether.berlayar.ai/api/route-human/discord-interaction
   ```

   Discord will immediately PING this URL — if the env vars aren't set
   yet, save will fail with "interactions endpoint failed verification".
   Ship the worker with the vars below first, then fill this in.

## 3 · Secrets

### Local (`.dev.vars`)

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
DISCORD_PUBLIC_KEY=<64 hex chars from the app page>
DISCORD_APPLICATION_ID=<numeric application id>
GITHUB_MERGE_TOKEN=ghp_... # or leave blank to fall back to CLAUDE_CODE_OAUTH_TOKEN
GITHUB_REPOSITORY=erniesg/aether
```

### Cloudflare Worker (staging + production)

```bash
wrangler secret put --env staging DISCORD_WEBHOOK_URL
wrangler secret put --env staging DISCORD_PUBLIC_KEY
wrangler secret put --env staging DISCORD_APPLICATION_ID
wrangler secret put --env staging GITHUB_MERGE_TOKEN
wrangler secret put --env staging GITHUB_REPOSITORY
# repeat with --env production
```

### GitHub Actions

Add the four secrets under **Settings → Secrets and variables → Actions**
so the reviewer agent can post notifications from CI:

- `DISCORD_WEBHOOK_URL`
- `DISCORD_PUBLIC_KEY` (only needed if a workflow verifies signatures)
- `DISCORD_APPLICATION_ID`
- `GITHUB_MERGE_TOKEN` (optional override; the action's default
  `${{ secrets.GITHUB_TOKEN }}` can drive `listOpenIssuesByLabel`,
  `addLabel`, and `addComment` out of the box, but merging a PR on the
  main branch needs a PAT with `repo` scope).

## 4 · Required labels

Run once from any checkout with `gh` authenticated:

```bash
gh label create "depends-on:pr-X"  --description "Blocked until PR X merges; claude-run is auto-added on merge" --color "FBCA04"
gh label create "ready-for-ernie"  --description "Green tests + reviewer APPROVE; awaiting Discord ack"          --color "0E8A16"
gh label create "auto-merge-safe"  --description "Chore/docs/test-only — bypass Discord gate on green"           --color "CFD3D7"
gh label create "queue-paused"     --description "Autonomous queue paused; agents skip claude-run issues"        --color "D93F0B"
```

`depends-on:pr-X` is a **pattern**. For any specific dependency you'd
create `depends-on:pr-57` on the blocked issue(s). The merge handler
scans for those at merge time and re-dispatches.

## 5 · Verify end-to-end

1. `npm run test lib/route-human` — all unit + contract tests green.
2. `npm run build && npm run deploy:stg` — worker up at
   `aether-stg.berlayar.ai`.
3. Save the interactions endpoint URL on the Discord app page → Discord
   sends a PING → the route responds with `{type: 1}`. If save succeeds
   there, signature verification is wired correctly.
4. Post a synthetic `ready-for-ernie` notification from a local script:

   ```bash
   DISCORD_WEBHOOK_URL=... npx tsx -e '
     import("./lib/route-human/discord").then(async ({ sendReviewNotification }) => {
       await sendReviewNotification({
         kind: "ready-for-ernie",
         issueNumber: 0, issueTitle: "smoke test",
         prNumber: 0, prUrl: "https://github.com/erniesg/aether",
         branch: "smoke", author: "claude",
         acceptanceChecklist: [{ item: "webhook works", passed: true }],
         reviewerVerdict: "APPROVE", reviewerSummary: "smoke test",
         artifacts: [], testSummary: { total: 1, passed: 1, failed: 0 },
       });
     });
   '
   ```

5. The card appears in `#aether-review` with four buttons.
6. Click `✗ block` on the smoke-test PR number (use a throwaway PR) to
   verify the round-trip — the PR is closed, a comment is posted.

## Troubleshooting

- **"interactions endpoint failed verification"** — either the worker
  isn't deployed, `DISCORD_PUBLIC_KEY` is wrong, or the route is reading
  the body after Next.js has parsed it. Always read `request.text()`
  before parsing; the signature is over the raw bytes.
- **Button press hangs / "interaction failed"** — the route must respond
  within 3 seconds. Heavy GitHub work should go behind
  `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` (type 5) + a followup PATCH;
  merge+cascade is fast enough today to respond synchronously.
- **PR merges but dependents don't re-dispatch** — check that the
  dependent issues have the exact label `depends-on:pr-<N>` (case
  matters) and are `state:open`.
