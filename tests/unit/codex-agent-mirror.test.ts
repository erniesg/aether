import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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

const localCodexAction = readFileSync(
  resolve(process.cwd(), '.github/actions/local-codex-intake/action.yml'),
  'utf8'
);

const localCodexIntakePath = resolve(process.cwd(), '.github/scripts/local-codex-intake.mjs');
const localCodexIntake = readFileSync(localCodexIntakePath, 'utf8');

describe('codex.yml dual-agent mirror', () => {
  it('declares the codex/issue-* branch convention and codex-run label trigger', () => {
    expect(codexWorkflow).toContain('codex/issue-<n>-*');
    expect(localCodexIntake).toContain('codex/issue-${issueNumber}-');
    expect(codexWorkflow).toContain('codex-run');
  });

  it('does not invoke remote Codex or require OpenAI API credentials', () => {
    expect(codexWorkflow).toContain('Remote Codex execution disabled');
    expect(codexWorkflow).toContain('does not use OpenAI API keys');
    expect(codexWorkflow).toContain('Run Codex locally');
    expect(codexWorkflow).not.toContain('OPENAI_CODEX' + '_API_KEY');
    expect(codexWorkflow).not.toContain('CODEX_ACTION' + '_ENABLED');
    expect(codexWorkflow).not.toContain('openai/' + 'codex-action');
    expect(localCodexAction).not.toContain('OPENAI_CODEX' + '_API_KEY');
    expect(localCodexAction).not.toContain('CODEX_ACTION' + '_ENABLED');
    expect(localCodexAction).not.toContain('openai/' + 'codex-action');
  });

  it('mirrors claude.yml structural pieces (refresh, PR creation, dispatch)', () => {
    expect(codexWorkflow).toContain('Resolve agent target branch');
    expect(codexWorkflow).toContain('./.github/actions/local-codex-intake');
    expect(codexWorkflow).toContain('Refresh existing PR branch from main');
    expect(codexWorkflow).toContain('Open PR for queued codex branch');
    expect(codexWorkflow).toContain('Dispatch CI + reviewer for fresh codex PRs');

    expect(localCodexIntake).toContain("git(['merge', '--no-edit', 'origin/main'])");
    expect(localCodexIntake).toContain("'pr',");
    expect(localCodexIntake).toContain("'create',");
    expect(localCodexIntake).toContain("'workflow', 'run', 'ci.yml'");
    expect(localCodexIntake).toContain("'workflow', 'run', 'claude-review.yml'");
  });

  it('triggers on the same events as claude.yml', () => {
    expect(codexWorkflow).toMatch(/issues:\s*\n\s*types:\s*\[opened, labeled\]/);
    expect(codexWorkflow).toMatch(/pull_request:\s*\n\s*types:\s*\[opened\]/);
    expect(codexWorkflow).toContain('issue_comment');
    expect(codexWorkflow).toContain('pull_request_review_comment');
  });

  it('treats codex-run as local branch intake, not a remote coding task', () => {
    expect(codexWorkflow).toContain('Local Codex branch intake');
    expect(localCodexIntake).toContain('Waiting for a local Codex push');
    expect(codexWorkflow).toContain('Open PR for queued codex branch');
    expect(codexWorkflow).toContain('persist-credentials: false');
    expect(localCodexIntake).toContain('withAuthenticatedOrigin');
    expect(codexWorkflow).not.toContain('Commit Codex changes to agent branch');
    expect(codexWorkflow).not.toContain('PLACEHOLDER');
  });

  it('uses a repo-owned local Codex intake action instead of a third-party remote coding action', () => {
    expect(localCodexAction).toContain('using: composite');
    expect(localCodexAction).toContain('local-codex-intake.mjs');
    expect(localCodexAction).toContain('mode');
    expect(codexWorkflow).toContain('mode: resolve');
    expect(codexWorkflow).toContain('mode: refresh');
    expect(codexWorkflow).toContain('mode: intake');
    expect(codexWorkflow).toContain('mode: open-pr');
    expect(codexWorkflow).toContain('mode: dispatch');
    expect(codexWorkflow).toContain('mode: drain');
  });

  it('drains queued branches from trusted default-branch workflow code', () => {
    expect(codexWorkflow).not.toMatch(/push:\s*\n\s*branches:\s*\n\s*-\s*'codex\/issue-\*'/);
    expect(codexWorkflow).toContain('workflow_dispatch');
    expect(codexWorkflow).toContain('schedule:');
    expect(codexWorkflow).toContain("github.event_name == 'schedule'");
    expect(codexWorkflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(codexWorkflow).toContain("github.ref_name == github.event.repository.default_branch");
    expect(codexWorkflow).toContain("ref: ${{ github.event.repository.default_branch || 'main' }}");
    expect(localCodexIntake).toContain('drainQueuedCodexBranches');
    expect(localCodexIntake).toContain('remoteCodexIssueNumbers');
  });

  it('pauses public GitHub writes during Singapore working hours by default', async () => {
    const { isPublicWriteAllowed } = await import(pathToFileURL(localCodexIntakePath).href);
    expect(codexWorkflow).toContain("AETHER_PUBLIC_WRITE_POLICY || 'after-hours-sgt'");
    expect(localCodexIntake).toContain('after 18:00 SGT');
    expect(
      isPublicWriteAllowed('after-hours-sgt', new Date('2026-05-06T04:00:00.000Z'))
    ).toBe(false);
    expect(
      isPublicWriteAllowed('after-hours-sgt', new Date('2026-05-06T11:00:00.000Z'))
    ).toBe(true);
    expect(isPublicWriteAllowed('always', new Date('2026-05-06T04:00:00.000Z'))).toBe(
      true
    );
  });

  it('only fires on codex-relevant events (label / @codex / codex branch)', () => {
    // Without this guard, the token-missing fail-fast exits 1 on every PR
    // opened against main, polluting the check list. The job-level if
    // filter keeps the runner cold for non-codex events.
    expect(codexWorkflow).toContain("contains(github.event.issue.labels.*.name, 'codex-run')");
    expect(codexWorkflow).toContain("contains(github.event.comment.body, '@codex')");
    expect(codexWorkflow).toContain("startsWith(github.event.pull_request.head.ref, 'codex/issue-')");
    expect(codexWorkflow).toContain("github.event_name == 'schedule'");
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
