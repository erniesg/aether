# AIE2026 public promotion and rollback plan

Target URL: `https://aether.berlayar.ai/vibes/aie2026`

The URL is served by `workers/aie2026-vibes.ts`. The worker reads the public data from R2 key:

`event-recap-ai-engineer-singapore/public.json`

Promotion should replace only that R2 object after candidate validation passes. Keep the current object as a local backup and keep the promoted candidate under an immutable versioned key.

## Preconditions

- Candidate folder exists: `outputs/event-recap-ai-engineer-singapore/refreshes/<refreshId>/`
- Candidate files exist and validate:
  - `archive.candidate.json`
  - `public.candidate.json`
  - `manifest.json`
  - `merge-audit.json`
  - `dedupe-audit.json`
  - `metrics-audit.json`
  - `conversation-audit.json`
  - `rollback-notes.md`
- Human relevance overlay applied:
  - `68` held rows included
  - `11` held rows excluded
  - comments/replies attached only to kept parents
  - ClawCon kept as side-event context
  - Vivian/NanoClaw propagation kept as multiplier context

## Promotion commands

Set a refresh ID first:

```bash
export REFRESH_ID=<refreshId>
export REFRESH_DIR="outputs/event-recap-ai-engineer-singapore/refreshes/$REFRESH_ID"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"
export R2_VERSIONED_KEY="event-recap-ai-engineer-singapore/public.$REFRESH_ID.json"
```

Record and back up the current live public object:

```bash
npx wrangler r2 object get "aether-assets/$R2_PUBLIC_KEY" \
  --file "$REFRESH_DIR/public.backup.$REFRESH_ID.json"

shasum -a 256 "$REFRESH_DIR/public.backup.$REFRESH_ID.json" \
  "$REFRESH_DIR/public.candidate.json" \
  > "$REFRESH_DIR/promotion-checksums.txt"
```

Store the candidate immutably, then promote the pointer:

```bash
cp "$REFRESH_DIR/public.candidate.json" "$REFRESH_DIR/public.$REFRESH_ID.json"

npx wrangler r2 object put "aether-assets/$R2_VERSIONED_KEY" \
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \
  --content-type "application/json; charset=utf-8"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \
  --content-type "application/json; charset=utf-8"
```

If worker code changed too, deploy the worker after tests pass:

```bash
npx wrangler deploy --config wrangler.aie2026.jsonc
```

## Post-promotion smoke

```bash
curl -fsS "https://aether.berlayar.ai/vibes/aie2026/data" \
  | jq '{postCount:(.posts|length), themeCount:(.themes|length), generatedAt, updatedAt}'

curl -fsSI "https://aether.berlayar.ai/vibes/aie2026" \
  | sed -n '1,12p'
```

Open the page and spot-check:

- sidebar renders
- source JSON download works
- media still loads
- comments/replies do not appear as standalone roots
- no raw provider payload appears outside `?debug=1`

## Data rollback

Restore the backed-up public object over the live pointer:

```bash
export REFRESH_ID=<refreshId>
export REFRESH_DIR="outputs/event-recap-ai-engineer-singapore/refreshes/$REFRESH_ID"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \
  --file "$REFRESH_DIR/public.backup.$REFRESH_ID.json" \
  --content-type "application/json; charset=utf-8"
```

No schema migration is required for rollback because the worker keeps reading the same R2 key.

## Worker-code rollback

If a worker-only deploy needs rollback, revert the worker change in git and deploy the previous worker:

```bash
git revert <commit-that-changed-workers/aie2026-vibes.ts>
npx wrangler deploy --config wrangler.aie2026.jsonc
```
