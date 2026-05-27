# Rollback notes for 2026-05-27T07-05-28Z-human-reviewed-delta

This refresh is isolated. It does not overwrite `archive.json` or `public.json` during candidate generation.

Candidate folder:

`/Users/erniesg/code/erniesg/aether/outputs/event-recap-ai-engineer-singapore/refreshes/2026-05-27T07-05-28Z-human-reviewed-delta`

Before promotion, the current public artifact was copied locally to:

`/Users/erniesg/code/erniesg/aether/outputs/event-recap-ai-engineer-singapore/refreshes/2026-05-27T07-05-28Z-human-reviewed-delta/public.backup.2026-05-27T07-05-28Z-human-reviewed-delta.json`

Candidate immutable public artifact:

`/Users/erniesg/code/erniesg/aether/outputs/event-recap-ai-engineer-singapore/refreshes/2026-05-27T07-05-28Z-human-reviewed-delta/public.2026-05-27T07-05-28Z-human-reviewed-delta.json`

## Promote data after validation

```bash
export REFRESH_ID=2026-05-27T07-05-28Z-human-reviewed-delta
export REFRESH_DIR="outputs/event-recap-ai-engineer-singapore/refreshes/2026-05-27T07-05-28Z-human-reviewed-delta"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"
export R2_VERSIONED_KEY="event-recap-ai-engineer-singapore/public.$REFRESH_ID.json"
export REFRESH_MEDIA_DIR="outputs/event-recap-ai-engineer-singapore/media/refreshes/$REFRESH_ID"

if [ -d "$REFRESH_MEDIA_DIR" ]; then
  find "$REFRESH_MEDIA_DIR" -type f | while IFS= read -r file; do
    key="${file#outputs/}"
    npx wrangler r2 object put "aether-assets/$key" --file "$file"
  done
fi

npx wrangler r2 object put "aether-assets/$R2_VERSIONED_KEY" \
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \
  --content-type "application/json; charset=utf-8"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \
  --content-type "application/json; charset=utf-8"
```

## Roll back data

```bash
export REFRESH_ID=2026-05-27T07-05-28Z-human-reviewed-delta
export REFRESH_DIR="outputs/event-recap-ai-engineer-singapore/refreshes/2026-05-27T07-05-28Z-human-reviewed-delta"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \
  --file "$REFRESH_DIR/public.backup.$REFRESH_ID.json" \
  --content-type "application/json; charset=utf-8"
```

No schema migration is required. The worker keeps reading the same R2 key.
Uploaded refresh media can remain in R2 after rollback; the restored public JSON no longer references it.

## Candidate counts

- Baseline archive rows: 1770
- Sidecar rows: 852
- Explicitly excluded sidecar rows: 14
- Conversation guard excluded sidecar rows: 31
- Recovered parent rows added: 4
- Candidate archive rows: 2581
