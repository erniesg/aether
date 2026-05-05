# Agent routing

How the harness chooses between author agents (Claude / Codex), what each is responsible for, and how cross-review works.

## Author agents

The repo runs two author agents in parallel:

| Workflow | Agent | Branch convention | Label trigger | Token secret |
|---|---|---|---|---|
| [`.github/workflows/claude.yml`](../.github/workflows/claude.yml) | Anthropic Claude (Claude Code) | `claude/issue-<n>-<slug>` | `claude-run` | `CLAUDE_CODE_OAUTH_TOKEN` |
| [`.github/workflows/codex.yml`](../.github/workflows/codex.yml) | OpenAI Codex | `codex/issue-<n>-<slug>` | `codex-run` | `OPENAI_CODEX_OAUTH_TOKEN` |

Both workflows share the same surrounding plumbing: branch resolution, refresh-from-main, budget-independent PR creation, and explicit dispatch of `ci.yml` + `claude-review.yml` for fresh PRs.

## Cost discipline (load-bearing)

Both workflows require **subscription-backed OAuth/session tokens**, never pay-per-token API keys for the autopilot path. If the relevant token secret is missing, the workflow fails fast with a clear error before invoking the agent.

The fail-fast guard exists because silent fallback to API-key billing is exactly the kind of "context failure" the rubric/reviewer arc is meant to prevent. A runaway agent on a metered token is the worst possible outcome.

## Routing rules

### When the harness adds the label

If neither label is present when an issue opens, the **harness adds `claude-run` by default** for primary work. `codex-run` is added only by:

- A maintainer manually preferring Codex for a specific ticket.
- The cross-review pattern (when claude-review needs Codex's second opinion on a Claude-authored PR).
- A skill or capability tagged as `prefers:codex` (future).

### When both labels are present

If both labels are on the same issue, both workflows fire in parallel. The first agent to ship a PR wins; the other's branch is left for human review or comparison.

This is intentional: it gives the maintainer an explicit way to A/B authoring strategies on a single ticket, at the cost of duplicate compute.

### Mutual exclusion is NOT enforced

We don't enforce a label mutex because the labels are user intent, not workflow state. If a maintainer wants both agents to compete, that's a valid choice. Future tooling (a queue controller) can layer concurrency limits on top — see the `tech-debt` issues.

## Cross-review

`claude-review.yml` matches BOTH `claude/issue-*` and `codex/issue-*` head branches. This means:

- A Claude-authored PR is reviewed by **Claude** (fresh-context invocation, separate from the author).
- A Codex-authored PR is reviewed by **Claude** (cross-agent second opinion).

The reviewer is always Claude in v1. We rely on the fresh-context invocation + the rubric/personas grounding to keep the reviewer independent from the author.

A `codex-review.yml` mirror (Codex-as-reviewer) is a future option if we want bidirectional cross-review. Not needed in v1 since the reviewer's job is rubric enforcement, which is agent-agnostic.

## Self-heal arc (reuse across agents)

The CI failure router (`.github/workflows/ci-failure-router.yml`) fires on `ci.yml` failures for **either** `claude/issue-*` or `codex/issue-*` branches. The router posts a structured failure packet, increments a retry counter, and either re-fires the corresponding `*-run` label or escalates to Discord. Both agents share the same retry budget mechanism.

## Budget guardrails

Hard limits per workflow run:

| Limit | Value | Where |
|---|---|---|
| Max agent turns | 250 (Claude) / TBD (Codex) | `claude_args` / codex agent step |
| Max wall-clock | 60 min | `timeout-minutes` in workflow |
| CI failure retries | 2 | `MAX_RETRIES` in `ci-failure-router.yml` |

Beyond these, the route-review-verdict + ci-failure-router escalate to Ernie via Discord. There is no automated escape past `needs-human-review`.

## Where this lives in the docs

- **`docs/qa-rubric.md`** — what the agent is being held to.
- **`docs/reviewer-personas.md`** — how the reviewer enforces it.
- **`docs/agent-routing.md`** (this file) — which agent is responsible for which work.
- **`AGENTS.md`** — product-level hard rules every agent must follow regardless of routing.
