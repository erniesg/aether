import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/claude.yml'), 'utf8');
const ciWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
const reviewWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/claude-review.yml'),
  'utf8'
);

describe('claude author workflow branch targeting', () => {
  it('resolves an existing PR branch before checkout for issue re-dispatches', () => {
    expect(workflow).toContain('name: Resolve agent target branch');
    expect(workflow).toContain("startswith(\\\"claude/issue-${ISSUE_NUMBER}-\\\")");
    expect(workflow).toContain('checkout_ref=${checkout_ref}');
    expect(workflow).toContain('existing_pr_branch=${existing_pr_branch}');
    expect(workflow).toContain('ref: ${{ steps.agent_target.outputs.checkout_ref || github.ref }}');
  });

  it('refreshes the existing PR branch from main before the author agent continues', () => {
    expect(workflow).toContain('name: Refresh existing PR branch from main');
    expect(workflow).toContain('git checkout -B "${TARGET_BRANCH}" "origin/${TARGET_BRANCH}"');
    expect(workflow).toContain('git merge --no-edit origin/main');
    expect(workflow).toContain('git push origin "HEAD:${TARGET_BRANCH}"');
  });

  it('explicitly dispatches PR checks after bot-pushed branch refreshes', () => {
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('dispatch_pr_checks()');
    expect(workflow).toContain('gh workflow run ci.yml --ref "${TARGET_BRANCH}"');
    expect(workflow).toContain(
      'gh workflow run claude-review.yml --ref "${TARGET_BRANCH}" -f "pr_number=${TARGET_PR_NUMBER}"'
    );
    expect(workflow).toContain('gh workflow run ci.yml --ref "${EXISTING_PR_BRANCH}"');
    expect(workflow).toContain(
      'gh workflow run claude-review.yml --ref "${EXISTING_PR_BRANCH}" -f "pr_number=${EXISTING_PR_NUMBER}"'
    );
  });

  it('bases Claude on the resolved branch and grants validation commands', () => {
    expect(workflow).toContain('base_branch: ${{ steps.agent_target.outputs.base_branch }}');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('issue_number:');
    expect(workflow).toContain('CI failure repair packet');
    expect(workflow).toContain('prompt: >-');
    expect(workflow).toContain('ISSUE_NUMBER: ${{ github.event.issue.number || inputs.issue_number ||');
    expect(workflow).toContain('Bash(npm install)');
    expect(workflow).toContain('Bash(npm test:*)');
    expect(workflow).toContain('Bash(npm run typecheck)');
    expect(workflow).toContain('Bash(gh pr checks:*)');
  });

  it('merges follow-up agent branches back into the existing PR branch when possible', () => {
    expect(workflow).toContain('EXISTING_PR_BRANCH: ${{ steps.agent_target.outputs.existing_pr_branch }}');
    expect(workflow).toContain('if [ -n "${EXISTING_PR_BRANCH:-}" ]; then');
    expect(workflow).toContain('git merge --ff-only "origin/${BRANCH}"');
    expect(workflow).toContain('Merged follow-up agent branch');
  });
});

describe('manual workflow dispatch support for refreshed PR heads', () => {
  it('lets ci run as a workflow_dispatch check on the PR head branch', () => {
    expect(ciWorkflow).toContain('workflow_dispatch:');
    expect(ciWorkflow).toContain(
      "if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'"
    );
  });

  it('lets claude-review run for an explicit PR number on a dispatched branch', () => {
    expect(reviewWorkflow).toContain('workflow_dispatch:');
    expect(reviewWorkflow).toContain('pr_number:');
    expect(reviewWorkflow).toContain('name: Resolve PR context');
    expect(reviewWorkflow).toContain('allowed_bots: "*"');
    expect(reviewWorkflow).toContain('gh pr view "${PR_NUMBER}"');
    expect(reviewWorkflow).toContain('ref: ${{ steps.pr_context.outputs.head_sha }}');
    expect(reviewWorkflow).toContain('PR_NUMBER: ${{ steps.pr_context.outputs.number }}');
    expect(reviewWorkflow).toContain('PR_HEAD_REF: ${{ steps.pr_context.outputs.head_ref }}');
  });
});
