# Reviewer personas

Five risk-surface personas. Each fires by touched-paths routing (see the auto-routing table at the bottom). Each persona emits structured verdicts with PASS / FAIL / UNVERIFIABLE per falsifiable assertion, every assertion backed by locatable proof.

Personas exist for the reviewer agent, not for humans. They map to **risk surfaces**, not to job titles or process roles. Adding a sixth persona requires identifying a concrete failure mode the existing five cannot catch.

## Falsifiability rules (apply to every persona)

1. Every assertion must answer **"what file/line/output proves this?"**
2. Phrasing rejected as unfalsifiable: `should`, `might`, `could`, `looks good`, `feels right`, `is intuitive`, `is performant`, `is clean`. The reviewer marks these `UNVERIFIABLE` and requests rephrasing.
3. Proof format must be one of: file path with line number, test id, screenshot path, JSON path, structured log line, video timestamp range, GitHub Actions run URL.
4. Proof media must match the behavior being claimed: screenshots for static state, video or Playwright trace for multi-step interactions, JSON/log proof for non-UI contracts.
5. `UNVERIFIABLE` without `proof` attached → reviewer requests media in a PR comment; PR is blocked from merging until the proof lands. **No "skip with justification" escape hatch** — that becomes the loophole.
6. The reviewer never modifies code. It only emits verdicts and requests artifacts.

---

## correctness

**Risk surface**: types pass, tests pass, contracts honored, no silent regression.
**Auto-fire**: always.
**Author obligation**: keep the build green. Failing tests must be on the diff or referenced in a `Fixes #N` line.

| ID | Assertion | Verification | Proof format |
|----|-----------|--------------|--------------|
| C1 | `npm run typecheck` exits 0 | CI step `verify` | actions run URL |
| C2 | `npm test` exits 0 | CI step `verify` | actions run URL |
| C3 | Every new exported symbol in `lib/` has at least one test in a sibling `*.test.ts` file | grep diff for `^export ` and check for matching test descriptions | `lib/<file>.ts:N` ↔ `<file>.test.ts:M` |
| C4 | No `// TODO`, `// XXX`, `// FIXME`, or `console.log` left in shipped non-test code | grep diff | grep output |
| C5 | No `.only` or `.skip` left in test diffs | grep diff | grep output |
| C6 | Diff includes red→green commits for new behavior (failing test commit before implementation commit) | git log between merge-base and HEAD; reviewer scans the order of test-prefixed vs feat/fix-prefixed commits | commit shas (the test commit must precede the implementation commit) |

---

## demo-arc

**Risk surface**: the hero flow described in `docs/DEMO.md` continues to complete end-to-end without manual steps. The demo is the product; if it breaks, nothing else matters.
**Auto-fire**: when `app/workspace/**`, `components/canvas/**`, `lib/agent/auto-mode*`, or anything imported by the demo path changes.
**Author obligation**: if a demo step now requires manual intervention, surface it as a `BLOCK` decision packet — do not silently weaken the assertion.

| ID | Assertion | Verification | Proof format |
|----|-----------|--------------|--------------|
| D1 | The demo path in `docs/DEMO.md` continues to run end-to-end on staging without manual intervention | Manual rehearsal on `aether-stg.berlayar.ai` recorded as a video; or `tests/e2e/demo-arc.spec.ts` if the e2e fixture exists. **Note: the e2e is the goal — until it lands (tracked in tech-debt), recorded manual rehearsal is acceptable proof.** | video path + final screenshot path; or playwright run id once the e2e exists |
| D2 | Demo final canvas state matches the reference described in `docs/DEMO.md` (hero + variants present, brand tokens applied) | Visual diff against reference screenshot; or convex snapshot diff once the e2e lands | screenshot path or `convex-snapshot:<id>` |
| D3 | No unexpected prompts, modals, or system dialogs appear during the arc | Manual rehearsal observation, or Playwright `expect(page).not.toHaveDialog()` once e2e exists | screenshot path |
| D4 | Cold-start demo completes within 3 minutes wall-clock | Stopwatched manual rehearsal; or timing assertion in e2e | rehearsal log entry or `demo.duration_ms=<n>` |
| D5 | Every fan-out variant (4:5, 9:16, 16:9) renders without manual re-prompt | Visual snapshot per format (manual or e2e) | screenshot paths |
| D6 | Any changed key route or multi-step creator interaction is visible in a recording or Playwright trace, not inferred from static screenshots | inspect attached media for route name, timestamp range, and final canvas state | video path + timestamp range, or Playwright trace URL |

---

## provenance

**Risk surface**: every canvas mutation records a `capabilityRun` row in convex carrying inputs, outputs, and enough state to inspect/replay. (CLAUDE.md hard rule #8 — typed provenance.)
**Auto-fire**: when any file in `lib/agent/**`, `lib/capability/**`, or `convex/**` changes; or when a new tool/skill is added under `lib/agent/skills/**`.
**Author obligation**: any new mutation MUST emit a `capabilityRun` row through the existing capability factory path (`lib/capability/`). Mutations that bypass it are blocked.

> **v1 status — read this before applying P1–P5**: CLAUDE.md describes a typed `ToolRef` / `SkillRef` / `WorkflowRef` abstraction with `beforeSnapshotRef` / `afterSnapshotRef` fields. That abstraction is **aspirational** — the implementation today calls these `capabilityRun` rows and the snapshot-diff fields aren't typed. Assertions below reference the real paths (`lib/capability/factory.ts`, `lib/agent/skills/`). When the typed `ToolRef` form lands (tracked in tech-debt), this persona will be updated to require the typed shape.

| ID | Assertion | Verification | Proof format |
|----|-----------|--------------|--------------|
| P1 | New state-mutating Convex mutations record a `capabilityRun` row through `lib/capability/factory.ts` (or `proposeCapability`) | grep diff for `convex/*.ts` mutations + check for the factory call | file:line of the factory invocation |
| P2 | The recorded row carries inputs, outputs, and replay-relevant state | inspect the row's fields in the relevant `convex/*.ts` schema | schema diff or test fixture |
| P3 | New tool/skill registry entries appear under `lib/agent/skills/` with a manifest | check `lib/agent/skills/loader.ts` + `persistManifest.ts` | file diff |
| P4 | A test exists asserting the mutation produced a `capabilityRun` (or equivalent `text-apply`-style) record | grep test files for `capabilityRunId` / `capabilityRun` assertions | test id |
| P5 | New tools declare their schemas via `lib/agent/skills/types.ts` | type check + grep | type definition path |

---

## ux-restraint

**Risk surface**: layout, density, labels, and panel taxonomy match `AGENTS.md` (left = `input`, right = `output` + `metadata`, canvas chrome = `tool`, header = `navigation`, composer at bottom with scope chip). Restraint is a load-bearing product property.
**Auto-fire**: when `components/**` or `app/**` (non-API) changes.
**Author obligation**: do not mix taxonomy categories in one panel; do not add subtitles or per-item descriptions; default panel state is icon + chip with the body expanding on click.

| ID | Assertion | Verification | Proof format |
|----|-----------|--------------|--------------|
| U1 | New rail-panel default state shows icon + chip only (≤ 1 line) | Playwright visual snapshot of collapsed state | screenshot path |
| U2 | No `<p>` or text node > 80 characters added inside `components/rail/` | grep diff | grep output |
| U3 | No new toolbar created outside `components/canvas/` (single primary palette) | grep new `<Toolbar>` / `<FloatingToolbar>` instances in diff | grep output |
| U4 | Composer scope chip renders as exactly `global` or `local` | RTL test | test id |
| U5 | Rail item labels are ≤ 4 words and contain no descriptions | grep diff inside `components/rail/` | grep output |
| U6 | Diff does not introduce paper-texture / mono-font / monochrome rule violations | visual diff vs reference | screenshot path |
| U7 | Interaction-heavy UI changes include media that shows the full creator path without devtools, raw payloads, or debug-only surfaces in the primary view | review PR media proof against `docs/qa-rubric.md#media-proof-bar` | video timestamp range or Playwright trace URL |

---

## security-cost

**Risk surface**:
- No leaked credentials in code or commits.
- No new public API endpoints without auth.
- No API-budget-burning loops in autopilot paths (subscription-backed agents only).
- No hardcoded provider or model in code paths (CLAUDE.md hard rule #7).

**Auto-fire**: when `lib/providers/**`, `convex/**`, `app/api/**`, `.env*`, or any new LLM / image / video / audio call is added.
**Author obligation**: subscription-backed token paths only for autopilot work. Any pay-per-token API call must be (a) user-initiated, (b) bounded by an explicit token/cost cap, (c) gated by a config flag with a default that is off in autopilot.

| ID | Assertion | Verification | Proof format |
|----|-----------|--------------|--------------|
| S1 | No secret-looking strings in diff (GitGuardian + internal regex) | grep `(?i)(api[_-]?key\|secret\|token\|password)\s*=\s*['\"][^'\"]{16,}` | grep output |
| S2 | New `app/api/**` endpoints are auth-gated | grep `requireAuth\|getSession\|verifyToken` in handler | handler file:line |
| S3 | New LLM / image / video calls go through `ImageGenProvider`, `VideoGenProvider`, `getAgentClient()` — not direct SDK | grep direct SDK imports (`from '@anthropic-ai/sdk'`, `from 'openai'`, `from '@google/generative-ai'`) in diff | grep output |
| S4 | Autopilot agent invocations use OAuth/subscription token paths, not pay-per-token API keys | grep `OPENAI_API_KEY\|ANTHROPIC_API_KEY\|GOOGLE_GEMINI_API_KEY` in autopilot code | grep output + path |
| S5 | Any retry loop has explicit `maxAttempts` and `timeoutMs` | grep `while\|for\|setInterval` in retry-shaped code | file:line |
| S6 | Default model / provider choice lives in env or config, never inline | grep diff for hardcoded model strings (`gpt-4`, `claude-`, `gemini-`, `seedream-`, etc.) | grep output |

---

## Auto-routing table

| Touched path | Personas that fire |
|--------------|--------------------|
| (always) | `correctness` |
| `app/workspace/**`, `components/canvas/**`, `lib/agent/auto-mode*` | + `demo-arc` |
| `lib/agent/**`, `lib/capability/**`, `convex/**` | + `provenance` |
| `components/**`, `app/**` (non-API) | + `ux-restraint` |
| `lib/providers/**`, `convex/**`, `app/api/**`, `.env*`, new LLM/image/video adapter | + `security-cost` |

Multiple personas can fire on the same PR. Each emits its own structured verdict; the `route-verdict` step merges them with this priority:

```
BLOCK > REQUEST_CHANGES > APPROVE
```

If any persona returns `BLOCK`, the merged verdict is `BLOCK` and the human-review packet is forwarded to Discord with all flagged assertions.

## Output contract per persona

```json
{
  "persona": "correctness",
  "verdict": "APPROVE | REQUEST_CHANGES | BLOCK",
  "assertions": [
    {
      "id": "C1",
      "status": "PASS | FAIL | UNVERIFIABLE",
      "proof": "https://github.com/erniesg/aether/actions/runs/<id>",
      "note": "optional one-line explanation"
    }
  ],
  "humanReview": null
}
```

When `verdict` is `BLOCK`, `humanReview` follows the schema in `.github/workflows/claude-review.yml`:

```json
{
  "kind": "visual | product | architecture | other",
  "reason": "one concise sentence",
  "options": [
    { "label": "...", "description": "..." },
    { "label": "...", "description": "..." }
  ],
  "artifactUrls": ["..."]
}
```

`UNVERIFIABLE` assertions without a `proof` field cause the reviewer to leave a PR comment requesting the missing artifact (typically a screenshot, video, or JSON dump). The PR is blocked from merge until the artifact lands. There is no "justify and skip" path.
