import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const codexWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/codex.yml'),
  'utf8'
);

const claudeReview = readFileSync(
  resolve(process.cwd(), '.github/workflows/claude-review.yml'),
  'utf8'
);

const routeScript = readFileSync(
  resolve(process.cwd(), '.github/scripts/route-review-verdict.mjs'),
  'utf8'
);

describe('codex.yml dual-agent mirror', () => {
  it('declares the codex/issue-* branch convention and codex-run label trigger', () => {
    expect(codexWorkflow).toContain('codex/issue-${ISSUE_NUMBER}-');
    expect(codexWorkflow).toContain('codex-run');
  });

  it('fails fast if the subscription token is missing (no API-key fallback)', () => {
    expect(codexWorkflow).toContain('OPENAI_CODEX_OAUTH_TOKEN');
    expect(codexWorkflow).toContain('Subscription token guard');
    expect(codexWorkflow).toContain('exit 1');
    expect(codexWorkflow).toContain('subscription, never');
    expect(codexWorkflow).toContain('pay-per-token API budgets');
  });

  it('mirrors claude.yml structural pieces (refresh, PR creation, dispatch)', () => {
    // Branch resolution
    expect(codexWorkflow).toContain('Resolve agent target branch');
    // Refresh from main
    expect(codexWorkflow).toContain('Refresh existing PR branch from main');
    expect(codexWorkflow).toContain("git merge --no-edit origin/main");
    // PR creation fallback
    expect(codexWorkflow).toContain('Open PR for pushed codex branch (budget-independent)');
    expect(codexWorkflow).toContain('gh pr create');
    // Dispatch CI + reviewer for fresh PRs
    expect(codexWorkflow).toContain('Dispatch CI + reviewer for fresh codex PRs');
    expect(codexWorkflow).toContain('gh workflow run ci.yml');
    expect(codexWorkflow).toContain('gh workflow run claude-review.yml');
  });

  it('triggers on the same events as claude.yml', () => {
    expect(codexWorkflow).toMatch(/issues:\s*\n\s*types:\s*\[opened, labeled\]/);
    expect(codexWorkflow).toMatch(/pull_request:\s*\n\s*types:\s*\[opened\]/);
    expect(codexWorkflow).toContain('issue_comment');
    expect(codexWorkflow).toContain('pull_request_review_comment');
  });

  it('keeps the codex agent step as a clearly-marked placeholder', () => {
    // Until we wire an actual codex action, we want this step to be
    // obviously incomplete so a reviewer doesn't merge it as fully wired.
    expect(codexWorkflow).toContain('PLACEHOLDER');
    expect(codexWorkflow).toContain('TODO: wire to actual action');
  });
});

describe('cross-review pattern (claude-review handles both author agents)', () => {
  it("matches both 'claude/issue-*' and 'codex/issue-*' head branches", () => {
    expect(claudeReview).toContain("startsWith(github.event.pull_request.head.ref, 'claude/issue-')");
    expect(claudeReview).toContain("startsWith(github.event.pull_request.head.ref, 'codex/issue-')");
  });

  it('keeps the comment header explanation aligned with the new behavior', () => {
    expect(claudeReview).toContain('claude/issue-*');
    expect(claudeReview).toContain('codex/issue-*');
    expect(claudeReview).toMatch(/cross-review/i);
  });
});

describe('route-review-verdict accepts either agent prefix', () => {
  it('extracts the issue number from claude/issue-<n>- AND codex/issue-<n>- branches', () => {
    const fnMatch = routeScript.match(
      /function extractIssueNumberFromBranch\(ref\) \{([\s\S]*?)\n\}/
    );
    expect(fnMatch?.[1]).toBeTruthy();
    expect(fnMatch?.[1]).toMatch(/claude\|codex/);
  });
});
