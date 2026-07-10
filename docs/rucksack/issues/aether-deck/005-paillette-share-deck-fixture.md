# Paillette Share Deck Fixture

provider: vm-codex
depends-on: 001,002,003,004

## Goal

Add a Paillette share-deck fixture or workflow example that exercises the new deck contract, slide primitives, live-demo blocks, and export-pack plan. This proves Aether can express the concrete Paillette deck without editing Paillette directly.

The fixture should use the deck structure from the planning conversation as the validation target.

## Acceptance tests

- Add a deck workflow example for a repo/product deck using Paillette as the source app.
- The fixture covers intro slides: problem, solution, system architecture.
- The fixture covers live demos: product search, text search API, image search API, API access/key/usage.
- The fixture covers deep dives: hybrid retrieval, color/image search, public provenance, auth model, performance/scaling metrics.
- The fixture closes with ready vs next, repo/API docs/product links.
- The fixture includes block configs for Product, API, and Code drawer tabs.
- The fixture includes representative fragment reveals, hotspot targets, and speaker-note/presenter-mode metadata for live-demo and deep-dive sections.
- The fixture models API demos as allowlisted live calls, not arbitrary JS.
- The fixture models auth as public-search proxy, signed-in Logto calls, and existing persistent Paillette API keys. Ephemeral/demo tokens are noted as a future Paillette-side feature, not required for v1.
- The fixture includes representative code-reference entries with file path, symbol/section label, and explanation fields.
- The fixture can render with mocked demo responses in tests.
- No Paillette route, secret, or deploy config is modified.

## Validation command

```bash
npm run typecheck
npm test
```

If repo-wide Vitest has unrelated baseline failures, run the touched fixture tests plus the nearest deck tests and report the boundary.

## Allowed secrets

None. Use mocked demo responses and placeholder public URLs. Do not read or commit Paillette secrets.

## Artifact outputs

- Paillette deck fixture/example data.
- Tests proving required sections, live-demo allowlists, auth-mode metadata, and code-reference entries.
- Optional screenshot evidence showing the fixed 16:9 stage and Product/API/Code drawer.

## Stop conditions

Stop before editing the Paillette repo, adding real Paillette API keys, deploying, or hardcoding private endpoint credentials.

## Human clarification protocol

Ask only if the source app paths for Paillette cannot be represented as placeholders or mocked configs. Default to mocked demo responses and explicit TODO/provenance notes.

## Recommended response

Summarize the fixture location, which deck sections render, which live-demo configs are mocked, the commands run, and what would be needed to connect it to a live Paillette deployment.

## Trade-offs

Using a fixture avoids coupling Aether to Paillette's current deployment/auth state, but it still gives the VM a concrete validation target for reusable product-deck primitives.

## Free-form response

This is the human-validation demo for the issue pack. It should look like the Paillette deck target: intro, live demos, deep dives, and closing links, with a Product/API/Code drawer. Treat HyperFrames `/slideshow` as the interaction reference for fragments, hotspots, presenter mode, and speaker notes.
