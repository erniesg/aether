# Signal scout secrets

The signal scout (`/api/signals/scout`, `lib/signals/rapidapi/`) routes through a
single shared **RapidAPI key**. All four platform adapters — Pinterest, Instagram,
TikTok, Xiaohongshu — read `RAPIDAPI_KEY` and inject it as `X-RapidAPI-Key` on
each outbound call.

## Where to get the key

1. Sign in at <https://rapidapi.com/hub>.
2. Subscribe to the four scrapers we route through (defaults below). The free
   tiers cover the demo budget; bump tiers if you start seeing 429s.
3. Copy the **single API key** RapidAPI assigns to your account — that one key
   authenticates all subscribed APIs.

### Default hosts

| Platform     | Host (overridable via env)                           |
|--------------|------------------------------------------------------|
| Pinterest    | `pinterest-scraper-fast.p.rapidapi.com`              |
| Instagram    | `instagram-scraper-api2.p.rapidapi.com`              |
| TikTok       | `tiktok-scraper7.p.rapidapi.com`                     |
| Xiaohongshu  | `xiaohongshu-all-in-one.p.rapidapi.com`              |

If you swap to a different RapidAPI provider, override the host (and, where the
shape differs, the search path) via env. The parsers are defensive — they accept
several common response shapes — but you should re-run cassette tests with a
recorded fixture from the new provider before relying on it.

| Override env var                          | Defaults to                          |
|-------------------------------------------|--------------------------------------|
| `RAPIDAPI_PINTEREST_HOST`                 | `pinterest-scraper-fast.p.rapidapi.com` |
| `RAPIDAPI_PINTEREST_SEARCH_PATH`          | `/search`                            |
| `RAPIDAPI_INSTAGRAM_HOST`                 | `instagram-scraper-api2.p.rapidapi.com` |
| `RAPIDAPI_INSTAGRAM_HASHTAG_PATH`         | `/v1/hashtag`                        |
| `RAPIDAPI_INSTAGRAM_USER_PATH`            | `/v1/user_posts`                     |
| `RAPIDAPI_INSTAGRAM_SEARCH_PATH`          | `/v1/search`                         |
| `RAPIDAPI_TIKTOK_HOST`                    | `tiktok-scraper7.p.rapidapi.com`     |
| `RAPIDAPI_TIKTOK_KEYWORD_PATH`            | `/feed/search`                       |
| `RAPIDAPI_TIKTOK_HASHTAG_PATH`            | `/challenge/posts`                   |
| `RAPIDAPI_TIKTOK_USER_PATH`               | `/user/posts`                        |
| `RAPIDAPI_XHS_HOST`                       | `xiaohongshu-all-in-one.p.rapidapi.com` |
| `RAPIDAPI_XHS_SEARCH_PATH`                | `/search/notes`                      |
| `RAPIDAPI_XHS_USER_PATH`                  | `/user/notes`                        |

## Local development

Add the key to `.env.local` (gitignored):

```bash
RAPIDAPI_KEY=rapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Then run the smoke script to verify routing end-to-end:

```bash
node scripts/smoke-signals.mjs --query "warm shelf"
node scripts/smoke-signals.mjs --platform tiktok --query "skincare"
```

The smoke script exits cleanly with an informational note when `RAPIDAPI_KEY`
is unset — safe to wire into pre-commit / CI without leaking real calls.

## Cloudflare Workers (staging + production)

The Worker reads `RAPIDAPI_KEY` from its own secret store. Set per-environment:

```bash
# staging
wrangler secret put RAPIDAPI_KEY --env staging

# production
wrangler secret put RAPIDAPI_KEY --env production
```

Each command prompts for the value. Verify with `wrangler secret list --env staging`.

If you override hosts/paths per-env (e.g. moving the demo to a higher rate-limit
tier), put those as plain `vars` in `wrangler.jsonc`, not as secrets — they're
not sensitive.

## Rotating the key

1. Issue a new key from the RapidAPI dashboard.
2. Update `.env.local`, then run the smoke script.
3. `wrangler secret put RAPIDAPI_KEY --env staging`, then `… --env production`.
4. Revoke the old key.

## Troubleshooting

- **`MissingRapidApiKeyError`** — env var isn't set. Most often, you started
  `npm run dev` before adding it to `.env.local`. Restart the dev server.
- **`RapidApiHttpError: 401`** — key wrong or not subscribed to that specific
  RapidAPI provider. Check the subscriptions tab on RapidAPI for that host.
- **`RapidApiHttpError: 429`** — rate-limited. Bump the RapidAPI tier or
  back off concurrency in `lib/signals/rapidapi/scout.ts`.
- **Empty `hits`, no errors** — the provider returned a shape the parser doesn't
  recognize. Capture the raw response, drop a cassette under
  `tests/fixtures/signals-cassettes/<platform>/`, and tighten the parser.
