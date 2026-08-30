# Event Recap LinkedIn TinyFish Notes

LinkedIn collection for event recaps currently uses TinyFish because the official LinkedIn API does not provide normal public keyword post search for this use case.

Use this as the tool/operator contract until the workflow is promoted into a Codex skill:

- `warm_linkedin_session` starts a TinyFish Agent run for human handoff. `inspectorUrl` is the interactive browser for LinkedIn login or verification. `streamingUrl` is read-only preview/provenance and may disappear after the run ends.
- A verified LinkedIn browser run does not reliably share cookies with later TinyFish Agent scrape runs. Treat `browser-direct` as a best-effort logged-in probe, not the primary high-recall collector.
- Prefer broad TinyFish Search fanout plus TinyFish Fetch for LinkedIn recall. Preserve the original LinkedIn post URL casing for Fetch; lowercasing URLs is only safe for dedupe keys.
- TinyFish Fetch accepts at most 10 `urls` per request. Keep internal batches at 10 or below; 20-URL batches return `HTTP 400`.
- TinyFish Search page indexes stop at 10. Keep `maxSearchPagesPerQuery` at 11 or below; asking for 12 pages wastes one `HTTP 400` request per deep query.
- For refreshes, use `refresh_event_recap` with `targetItemsPerPlatform` and `dedupeAgainstExisting: true`. The tool builds a stored seen set, skips already archived LinkedIn URLs during TinyFish Search, and only sends unseen URLs to TinyFish Fetch. Pass `seenPostUrls` too when a previous run fetched and rejected URLs as noise, so later runs do not pay to re-fetch them.
- Request `image_links: true` when fetching LinkedIn pages. Store all returned media links as provenance, but only promote or download likely post-content media, not profile photos, backgrounds, logos, or static LinkedIn assets.
- Report LinkedIn counts as lower bounds. Search-index counts are cheap indexed-public URL estimates; browser-direct counts spend Agent credits and are still crawl lower bounds.
- Keep raw TinyFish run state, page errors, and streaming links in debug/provenance. Creator-facing recap output should expose references, clusters, voices, cited excerpts, and selected media artifacts.
