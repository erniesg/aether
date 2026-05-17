# Event Recap Apify X Notes

Use Apify as an optional X collection provider when the official X API is sparse, rate-limited, or when mention/profile/conversation inputs are easier to express through an Apify actor.

- `refresh_event_recap` supports `xProvider: "apify"`. It still builds a stored seen set and dedupes by canonical X status URL before merging results.
- Default actor is Apidojo Tweet Scraper V2 (`61RPP7dywgiy0JPD0`). The Lite actor provided for testing is `nfp1fpt5gUlBwPcor`.
- The actor input uses `searchTerms`, `startUrls`, `maxItems`, `sort`, `tweetLanguage`, `start`, and `end`. Prefer `sort: "Latest"` for lower overlap; use `"Latest + Top"` only when recall matters more than duplicate risk.
- Apify cannot cheaply exclude an arbitrary stored tweet-id set server-side. Keep `targetItemsPerPlatform` and `apifyCandidateMultiplier` conservative, then dedupe locally.
- Treat Apify X as a scrape/sample provider, not a proper count provider. For planning counts, prefer the official X recent counts endpoint; use Apify when official search is sparse or when actor-specific coverage is worth the credits.
- Normalize and store post metadata: likes, reposts/quotes, replies, views/impressions, author metadata, post URL, text, creation time, and media links.
- If a run returns only sentinel rows such as `noResults` or `demo`, inspect the actor run log. In local testing, the Apify actor reported that API use requires a paid Apify plan.
