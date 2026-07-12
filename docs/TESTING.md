# Testing

aether uses layered validation: fast static and unit gates while iterating, browser coverage for creator journeys, and human review for visible canvas behavior. Tests prove the surface they exercise; a mocked provider test does not prove a live provider, and a build does not prove a deployed runtime.

## Standard gates

| Gate | Command | Covers |
|---|---|---|
| Type safety | `npm run typecheck` | TypeScript across application, tests, scripts, and Convex code |
| Unit/component/integration | `npm test` | Vitest suites selected by `vitest.config.ts` |
| Focused Vitest | `npm test -- <path>` | One changed module or behavior while iterating |
| Next.js build | `npm run build` | Application compilation and route generation |
| Cloudflare build | `npm run cf-build` | OpenNext Worker packaging used by CI/deployment |
| Creator journeys | `npm run test:e2e` | Playwright specs under `tests/e2e/` and `tests/artifacts/` |
| Evidence capture | `npm run test:artifacts` | Deterministic artifact specs using `playwright.artifacts.config.ts` |

CI runs typecheck and Vitest first, then the Cloudflare build. Pull requests and manual dispatches also run Playwright. The live definition is [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Test ownership

```text
tests/unit/          pure logic, route contracts, scripts, registries
tests/component/     React behavior and UI taxonomy
tests/integration/   boundaries spanning more than one domain
tests/e2e/           creator journeys in a browser
tests/artifacts/     reproducible screenshots and review evidence
lib/**/*.test.*      tests colocated with domain helpers/adapters
app/**/*.test.*      route-level tests colocated with handlers
```

Provider adapters should prove normalization, routing, availability, and failure behavior without making paid calls by default. Live-provider checks must be explicit, bounded, and gated by environment variables.

## Change loop

1. State the observable acceptance criterion.
2. Add or identify the narrow test that fails for the missing behavior.
3. Implement the smallest change that makes it pass.
4. Run the focused test and typecheck.
5. Run the broader gate appropriate to the touched surface.
6. For visible or interaction-heavy changes, inspect the real workspace and capture evidence.

Commit coherent red/green slices when they help review. Never leave the branch head intentionally failing.

## Gate by change type

| Change | Minimum proof before merge |
|---|---|
| Docs or workflow metadata | link/path checks, `git diff --check`, and the affected script test when applicable |
| Pure library logic | focused Vitest plus typecheck |
| Provider adapter | contract tests, typecheck, and a bounded live check when the claim requires it |
| Convex schema/mutation | focused persistence tests, typecheck, and migration/compatibility reasoning |
| API route | route contract tests plus representative request/response evidence |
| Component | component test, typecheck, and visual inspection |
| Canvas interaction | component/unit coverage plus the relevant Playwright journey and human inspection |
| Deployment/runtime | Cloudflare build plus a real staging smoke against the deployed revision |

## Creator-loop expectations

Creator-facing changes should preserve the canonical loop from [AGENTS.md](../AGENTS.md):

- References and constraints feed the canvas rather than a separate dashboard.
- The composer stays at the bottom and displays its scope.
- Generated artifacts land on the canvas.
- Key visuals can fan out to linked formats with global/local semantics.
- Actions retain provenance.
- Export stays inside the single synthesis shell or a dedicated lens.

The broad browser anchor is `tests/e2e/creator-loop.spec.ts`. Use the more specific specs in `tests/e2e/` for generation, capability pinning, export, research, text propagation, publishing, or voice changes.

## Playwright usage

By default Playwright starts `npm run dev` at `http://localhost:3000`. To test an already-running or deployed surface:

```bash
AETHER_BASE_URL=https://example.invalid npm run test:e2e
```

Replace the example URL with the exact deployment under test. A local pass is not evidence that staging credentials, bindings, storage, or provider access work.

Artifact capture uses the same `AETHER_BASE_URL` convention:

```bash
AETHER_BASE_URL=https://example.invalid npm run test:artifacts
```

Name evidence by issue or behavior and keep only intentional, reviewed artifacts. Do not put browser profiles, auth state, secrets, or bulk generated media in `outputs/` or Git.

## Human validation

Human validation is required when correctness depends on composition, interaction, timing, readability, or creative judgment. Record the exact route/workspace, viewport, action sequence, and observed result. A screenshot proves a static state; use a Playwright trace or recording for drag/drop, generation progress, fan-out, editing, approval, and export sequences.

Use [qa-rubric.md](./qa-rubric.md) and [reviewer-personas.md](./reviewer-personas.md) to shape falsifiable issue/PR evidence. Automated reviewer workflows are currently dormant; the evidence bar still applies during human or Codex review.
