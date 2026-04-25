# workflows-proposed

Workflow files landed here by autonomous agents. The GitHub App that authors
agent PRs cannot modify `.github/workflows/*`, so new workflows are proposed
under this path and a human promotes them by moving the file.

## Promoting a workflow

```bash
git mv .github/workflows-proposed/<name>.yml .github/workflows/<name>.yml
git commit -m "chore(ci): promote <name> workflow"
git push
```

Every file in this directory is expected to end up in `.github/workflows/`
verbatim — the two are kept structurally identical so a diff review before
promotion is a one-liner.

## Current proposals

- `claude-review.yml` — fresh-context reviewer agent for `claude/issue-*` PRs
  (issue #55). Requires `.github/scripts/route-review-verdict.mjs` (already
  landed alongside the proposal).
