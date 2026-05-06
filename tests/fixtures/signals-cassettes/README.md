# RapidAPI signal cassettes

Recorded HTTP responses from the RapidAPI scrapers we route through `lib/signals/rapidapi/`.

Each cassette is a JSON file shaped like the production RapidAPI provider response.
Tests inject these cassettes via a fake `fetch` so we never hit the network during
`npm test`. Real-key validation lives in `scripts/smoke-signals.mjs`.

When a RapidAPI provider changes shape, re-record by running the smoke script with
`SAVE_CASSETTE=1` (TODO) or by capturing the live response with `curl` and dropping
the JSON in the matching directory.

Cassettes are intentionally minimal — one or two items, just enough to exercise the
parser. Add more items only when a parser path is otherwise untested.
