# Discord route-human notifications

The current supported path is a one-way `route-human` notification:

```text
issue or PR receives route-human
  -> .github/workflows/route-human-review.yml
  -> .github/scripts/notify-discord-human-review.mjs
  -> Discord card with links back to GitHub
```

This is a human-attention channel, not an active author/reviewer bot. The legacy Claude review workflow is disabled; see [agent-routing.md](./agent-routing.md).

## 1. Create the channel and webhook

1. Create or choose a Discord server.
2. Add a review channel, for example `#aether-review`.
3. Open **Server settings → Integrations → Webhooks → New Webhook**.
4. Point it at the review channel and copy its URL.

A standard channel webhook is the simplest supported delivery method because the GitHub workflow already includes the GitHub URL in message content when Discord cannot render link buttons.

## 2. Add the GitHub Actions secret

Add the webhook URL as the repository Actions secret `DISCORD_WEBHOOK_URL`.

The workflow also supports `DISCORD_WEBHOOK`, or an app bot through `DISCORD_BOT_TOKEN` plus `DISCORD_CHANNEL_ID`. The checked-in workflow currently pins its bot channel ID, so update that workflow deliberately before choosing a different bot-owned channel. Prefer `DISCORD_WEBHOOK_URL` for ordinary setup.

Do not put the webhook URL in `.dev.vars.example`, workflow YAML, issue comments, logs, or committed artifacts.

## 3. Create the routing label

Run once with `gh` authenticated:

```bash
gh label create route-human \
  --repo erniesg/aether \
  --color E88D67 \
  --description "Needs an explicit maintainer decision" \
  --force
```

Adding `route-human` to an issue or PR triggers the current workflow. Queue-state labels are governed separately by [agent-routing.md](./agent-routing.md); they are not required to deliver this notification.

## 4. Verify delivery

Run the notification script tests:

```bash
npm test -- tests/unit/discord-human-review.test.ts
```

Then use one of these live checks:

```bash
# Label a real issue that genuinely needs a maintainer decision.
gh issue edit <number> --repo erniesg/aether --add-label route-human

# Or manually dispatch a smoke notification for an existing issue.
gh workflow run route-human-review.yml \
  --repo erniesg/aether \
  -f target_type=issue \
  -f target_number=<number> \
  -f reason="Discord route-human delivery smoke"
```

Verify all three proof points:

1. the `route-human-review` Actions run succeeds;
2. one card appears in the intended Discord channel;
3. the card's link opens the exact issue or PR.

## Optional signed interaction endpoint

The repo still contains an older four-button interaction implementation under `lib/route-human/` and `app/api/route-human/discord-interaction/route.ts`. It can merge, request changes, pause, or block through signed Discord component payloads.

That path is **not part of the default route-human workflow** and still contains legacy `claude-run` re-dispatch behavior. Do not enable it for production queue control until that behavior is migrated to the current routing contract and revalidated.

If maintaining the endpoint itself, it requires:

- a Discord application public key as `DISCORD_PUBLIC_KEY`;
- a scoped GitHub token as `GITHUB_MERGE_TOKEN`;
- `GITHUB_REPOSITORY=erniesg/aether`;
- the Discord interactions URL set to `/api/route-human/discord-interaction` on the deployed domain.

The endpoint reads the raw request body before verifying the Ed25519 signature. Use a throwaway PR for any end-to-end button test because merge/block actions change GitHub state.

## Troubleshooting

- **No Actions run:** confirm the label is exactly `route-human` and the item is open.
- **Run succeeds but no message:** confirm `DISCORD_WEBHOOK_URL` is a repository Actions secret and still points to a live channel webhook.
- **Webhook returns 401/404:** rotate the deleted or invalid webhook and replace the secret.
- **Card has no buttons:** standard webhooks may not render components; the plain GitHub URL is the supported fallback.
- **Signed endpoint verification fails:** confirm `DISCORD_PUBLIC_KEY`, deployed route, and raw-body signature handling. This does not affect the one-way notification path.
