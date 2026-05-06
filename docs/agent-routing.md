# Agent routing

How the harness chooses between author agents (Claude / Codex), what each is responsible for, and how cross-review works.

## Author agents

The repo runs two author agents in parallel:

| Workflow | Agent | Branch convention | Label trigger | Token secret |
|---|---|---|---|---|
| [`.github/workflows/claude.yml`](../.github/workflows/claude.yml) | Anthropic Claude (Claude Code) | `claude/issue-<n>-<slug>` | `claude-run` | `CLAUDE_CODE_OAUTH_TOKEN` |
| [`.github/workflows/codex.yml`](../.github/workflows/codex.yml) | OpenAI Codex (local) | `codex/issue-<n>-<slug>` | `codex-run` | none |

Both workflows share the same surrounding plumbing: branch resolution, refresh-from-main, budget-independent PR creation, and explicit dispatch of `ci.yml` + `claude-review.yml` for fresh PRs.

## Cost discipline (load-bearing)

Claude uses a subscription-backed OAuth token inside its GitHub workflow. Codex work is local-only: run Codex from the desktop/CLI on a developer machine, commit locally, and push a `codex/issue-<n>-<slug>` branch.

The repo now includes a local [Codex subscription adapter](./codex-subscription-adapter.md) for ChatGPT subscription-backed Codex access. It understands the device login flow and Codex Responses headers, but live calls require explicit local `--live` invocation and are not wired into GitHub Actions.

The repo also has a manual `codex-subscription-preflight` workflow for a `self-hosted` runner labelled `codex-subscription`. It does not invoke Codex; it only checks that the local runner has the adapter and credential boundary ready.

`codex.yml` does not invoke remote Codex, does not require an OpenAI API key, and does not restore ChatGPT subscription credentials from secrets. It delegates to the repo-owned [`.github/actions/local-codex-intake`](../.github/actions/local-codex-intake/action.yml) action, which wraps [`.github/scripts/local-codex-intake.mjs`](../.github/scripts/local-codex-intake.mjs).

The local intake action only handles GitHub plumbing:

- resolve the existing Codex PR branch, if one exists;
- refresh that branch from `main`;
- open a PR when a local `codex/issue-<n>-<slug>` branch is pushed without a PR;
- explicitly dispatch CI + reviewer checks for that PR.

This prevents silent API-budget spend for remote coding tasks. The action is branch intake, not an authoring agent.

Security boundary: `codex.yml` checks out the intake harness from the default branch before running the local composite action. A pushed `codex/issue-*` branch is treated as data to be scanned and merged, not trusted workflow/action code.

By default public GitHub writes use `AETHER_PUBLIC_WRITE_POLICY=after-hours-sgt`, which pauses PR creation, PR comments, branch pushes, and workflow dispatches during Singapore working hours (09:00-18:00, Monday-Friday). Set the repo variable to `always` only when public timestamps during working hours are acceptable.

## Routing rules

### When the harness adds the label

If neither label is present when an issue opens, the **harness adds `claude-run` by default** for primary work. `codex-run` is added only by:

- A maintainer manually preferring Codex for a specific ticket.
- The cross-review pattern (when claude-review needs Codex's second opinion on a Claude-authored PR).
- A skill or capability tagged as `prefers:codex` (future).

For local Codex pickup, the useful path is:

1. Label the issue `codex-run`.
2. Run Codex locally from the desktop/CLI or the local subscription adapter.
3. Commit locally on `codex/issue-<n>-<slug>`.
4. Push that branch when public timestamps are acceptable.
5. The default-branch intake workflow drains queued branches from an issue-label event, manual `workflow_dispatch`, or the after-hours schedule, then opens or refreshes the PR and dispatches CI + reviewer.

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

## Self-heal arc

The CI failure router (`.github/workflows/ci-failure-router.yml`) fires on `ci.yml` failures for `claude/issue-*` branches. The router posts a structured failure packet, increments a retry counter, refreshes `claude-run` on the source issue, and explicitly dispatches `claude.yml` so the retry does not depend on `GITHUB_TOKEN` label events. If the source issue is missing or the retry budget is exhausted, it labels `route-human` and explicitly dispatches the human-review notification workflow.

Local Codex-authored branches receive normal CI and reviewer checks, but the router does not pretend GitHub can remotely repair them through subscription OAuth. A failed `codex/issue-*` PR needs a local Codex patch relay follow-up until an approved remote Codex authoring boundary exists.

## Budget guardrails

Hard limits per workflow run:

| Limit | Value | Where |
|---|---|---|
| Max agent turns | 250 (Claude) / local session limit (Codex) | `claude_args` / local Codex session |
| Max wall-clock | 60 min | `timeout-minutes` in workflow |
| CI failure retries | 3 | `CI_FAILURE_RETRY_LIMIT` repo variable, defaulted in `ci-failure-router.yml` |

Beyond these, the route-review-verdict + ci-failure-router escalate to Ernie via Discord. There is no automated escape past `needs-human-review`.

## Where this lives in the docs

- **`docs/qa-rubric.md`** — what the agent is being held to.
- **`docs/reviewer-personas.md`** — how the reviewer enforces it.
- **`docs/agent-routing.md`** (this file) — which agent is responsible for which work.
- **`AGENTS.md`** — product-level hard rules every agent must follow regardless of routing.
