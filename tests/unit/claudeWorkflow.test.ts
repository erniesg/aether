import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/claude.yml'), 'utf8');

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

  it('bases Claude on the resolved branch and grants validation commands', () => {
    expect(workflow).toContain('base_branch: ${{ steps.agent_target.outputs.base_branch }}');
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
