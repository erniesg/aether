# Live Demo Slide Blocks

provider: vm-codex
depends-on: 002

## Goal

Add creator-facing deck blocks for product frames, whitelisted API calls, code references, and metrics. These blocks should let product decks show real artifacts and safe interactions without becoming an admin console or arbitrary code runner.

The motivating Paillette deck needs live product search, live text/image API calls, API access examples, code references, and basic timing/response metrics from the current session.

## Acceptance tests

- Add a product-frame block that can show a same-origin product/app route with a clear open-in-new-tab fallback.
- Add a live API call block with method, path, editable JSON/body fields, Run button, response summary, raw JSON disclosure, timing, status, and copy curl/fetch actions.
- Live-demo blocks can be targeted by fragment and hotspot metadata so a presenter can reveal or navigate to the Product/API/Code focus without turning the deck into a generic control surface.
- API calls are allowlisted by deck config. Unsupported methods/paths are rejected before execution.
- The block supports public, signed-in, and presenter-provided auth modes without exposing vendor secrets in the browser.
- "Run code" means a constrained request builder for known endpoints, not arbitrary JavaScript execution.
- Add a code-reference block that shows file path, symbol/section label, and why it matters.
- Add a metrics strip for duration, result count, cache/rate-limit headers, and server timing fields when present.
- Every run records typed provenance: source endpoint, request shape, response summary, timestamp, and auth mode.
- Debug-only details remain behind a disclosure or `?debug=1`.
- Add tests for allowlist rejection, success/error states, auth-gated states, and secret-safe copy snippets.

## Validation command

```bash
npm run typecheck
npm test
```

If repo-wide Vitest has unrelated baseline failures, run the touched live-demo block tests plus an existing API/component test and report the boundary.

## Allowed secrets

None. Tests must use mocks or public placeholder endpoints. Do not commit API keys, bearer tokens, or vendor credentials.

## Artifact outputs

- Live demo deck block components.
- A typed live-demo config/allowlist helper.
- Component/unit tests for idle, running, success, error, unauthenticated, forbidden, unsupported-path, and secret-safe snippet behavior.
- Evidence note with commands and any screenshot paths.

## Stop conditions

Stop before adding WebRTC, voice, OpenAI Realtime, browser-side vendor keys, arbitrary JS sandboxing, or real secret persistence. Stop if a required API call cannot be safely allowlisted without a backend proxy and write a follow-up instead.

## Human clarification protocol

Ask only if a requested auth mode would require exposing a secret in the browser. Default to mocked/public calls for tests and explicit gated UI for signed-in calls.

## Recommended response

Summarize the added blocks, the allowlist/auth behavior, the tests run, and how a future Paillette fixture can provide concrete endpoint configs.

## Trade-offs

A constrained request builder is less flexible than a code sandbox, but it is the right v1 product boundary: it proves real API behavior without creating an unsafe general execution environment.

## Free-form response

Paillette live call examples to support later: source listing, text search, image search, signed-in API-key/usage lookup, and product search.
