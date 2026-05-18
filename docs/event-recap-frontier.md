# Event Recap Frontier Notes

Event recap collection should start from a reusable frontier, not ad hoc search strings.

- `generate_event_search_frontier` accepts structured `speakers`, `sponsors`, source URLs, and an optional official event URL. For supported official schedules, it fetches schedule metadata and fans out speaker/keynote names into reusable anchors.
- AI Engineer Singapore uses the official schedule API at `https://aie.65labs.org/api/v1/sessions?format=talk`. Keynote sessions are detected from schedule topics and ranked ahead of ordinary speakers.
- Speaker/keynote queries are labelled with source and bias. Schedule-derived names use `official-schedule`; explicit profile URLs or handles use `speaker-account`; sponsor/org names use `sponsor-org`.
- `estimate_event_counts` and `refresh_event_recap` reuse the expanded frontier. Schedule-derived queries are placed ahead of stale stored query sets so provider `maxQueries` can actually reach keynotes.
- Keep speaker fanout strict. Names are useful for recall, but they are announcement-heavy and can over-sample speaker promo. Relevance filtering still needs to keep attendee reactions, questions, critiques, takeaways, and useful resources ahead of generic announcements.
