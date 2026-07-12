# Workflow proposals

Workflow files landed here by autonomous agents. The GitHub App that authors
agent PRs cannot modify `.github/workflows/*`, so new workflows are proposed
under this path and a human promotes them by moving the file.

## Promoting a workflow

```bash
git mv .github/workflows-proposed/<name>.yml .github/workflows/<name>.yml
git commit -m "chore(ci): promote <name> workflow"
git push
```

Proposals are temporary. After promotion, remove the proposed copy and update
this index so it cannot be mistaken for a second active workflow.

## Current proposals

None.

The previous `claude-review.yml` proposal was promoted to
`.github/workflows/claude-review.yml` and is currently disabled. See
[`docs/agent-routing.md`](../../docs/agent-routing.md) for the active routing
policy before proposing or enabling agent automation.
