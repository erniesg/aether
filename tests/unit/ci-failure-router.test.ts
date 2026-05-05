import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  summarizeFailure,
  formatPacket,
  countPriorAttempts,
  runOrchestration,
  __setGhImpl,
  __setGhStdinImpl,
} from '../../.github/scripts/route-ci-failure.mjs';

const routeScript = readFileSync(
  resolve(process.cwd(), '.github/scripts/route-ci-failure.mjs'),
  'utf8'
);

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/ci-failure-router.yml'),
  'utf8'
);

describe('ci-failure-router workflow contract', () => {
  it('triggers only on ci.yml workflow_run failures', () => {
    expect(workflow).toContain('workflow_run');
    expect(workflow).toContain('workflows: [ci]');
    expect(workflow).toContain("conclusion == 'failure'");
  });

  it('routes only for agent branches (claude/issue-* or codex/issue-*)', () => {
    expect(workflow).toMatch(/\^\(claude\|codex\)\/issue-/);
  });

  it('captures the failure log via gh run view --log-failed', () => {
    expect(workflow).toContain('gh run view "$RUN_ID" --log-failed');
  });

  it('passes PR_NUMBER, ISSUE_NUMBER, BRANCH, RUN_ID, and MAX_RETRIES to the router script', () => {
    expect(workflow).toContain('PR_NUMBER:');
    expect(workflow).toContain('ISSUE_NUMBER:');
    expect(workflow).toContain('BRANCH:');
    expect(workflow).toContain('RUN_ID:');
    expect(workflow).toContain("MAX_RETRIES: '2'");
  });

  it('uses concurrency keyed on the workflow_run id', () => {
    expect(workflow).toContain('group: ci-failure-router-${{ github.event.workflow_run.id }}');
  });
});

describe('route-ci-failure script contract', () => {
  it('parses TypeScript errors with file:line:col + TS code + message', () => {
    expect(routeScript).toContain('error\\s+(TS\\d+)');
    expect(routeScript).toContain('typecheck:');
  });

  it('parses vitest FAIL lines with file > suite > test', () => {
    expect(routeScript).toContain('FAIL\\s+');
    expect(routeScript).toContain('tests:');
  });

  it('parses ESLint-shaped errors with file:line:col + severity + rule', () => {
    expect(routeScript).toContain('error|warning');
    expect(routeScript).toContain('lint:');
  });

  it('counts prior attempts via the `<!-- ci-failure-attempt:N -->` marker', () => {
    expect(routeScript).toContain('<!-- ci-failure-attempt:');
    expect(routeScript).toContain('countPriorAttempts');
    expect(routeScript).toContain("'.comments[].body'");
  });

  it('caps retries at MAX_RETRIES then escalates to needs-human-review + Discord', () => {
    expect(routeScript).toContain('MAX_RETRIES');
    expect(routeScript).toContain('escalateToHuman');
    expect(routeScript).toContain("'needs-human-review'");
    expect(routeScript).toContain('notifyDiscord');
  });

  it('refreshes the right agent label (claude-run for claude/issue-*, codex-run for codex/issue-*)', () => {
    // Branch-aware: pickAgentLabel chooses the label based on branch prefix.
    expect(routeScript).toContain('function pickAgentLabel');
    expect(routeScript).toContain("'codex/issue-'");
    expect(routeScript).toContain("'codex-run'");
    expect(routeScript).toContain("'claude-run'");
    // refreshClaudeRun threads the branch through.
    expect(routeScript).toMatch(/function refreshClaudeRun\(issueNumber, branch\)/);
  });

  it('extracts issue number from "Closes/Fixes/Resolves #N" then falls back to branch slug', () => {
    // Closes/Fixes/Resolves regex lives in the workflow YAML, not the script,
    // because the YAML resolves the issue number before invoking the script.
    expect(workflow).toContain('closes|fixes|resolves');
    expect(workflow).toContain('claude\\|codex)/issue-([0-9]+)-');
  });

  it('writes the PR comment + issue comment via --body-file - (stdin streaming)', () => {
    expect(routeScript).toContain("'--body-file', '-'");
    expect(routeScript).toContain('postIssueComment');
    expect(routeScript).toContain('postPrComment');
  });

  it('formats a structured packet with typecheck/tests/lint sections', () => {
    expect(routeScript).toContain('formatPacket');
    expect(routeScript).toContain('**Typecheck**');
    expect(routeScript).toContain('**Failing tests**');
    expect(routeScript).toContain('**Lint**');
  });

  it('caps each section at SECTION_LIMIT (= 8) with a "… N more" indicator (symmetric across categories)', () => {
    expect(routeScript).toContain('const SECTION_LIMIT = 8');
    expect(routeScript).toContain('.slice(0, SECTION_LIMIT)');
    expect(routeScript).toContain('summary.typecheck.length - SECTION_LIMIT');
    expect(routeScript).toContain('summary.tests.length - SECTION_LIMIT');
    expect(routeScript).toContain('summary.lint.length - SECTION_LIMIT');
  });

  it('falls back to raw log tail when no structured signals match', () => {
    expect(routeScript).toContain('No structured failures matched');
    expect(routeScript).toContain('log.slice(-3500)');
  });
});

describe('summarizeFailure parser', () => {
  it('extracts TypeScript errors with file/line/col/code/msg', () => {
    const log = `
> aether@0.1.0-hackathon typecheck
> tsc --noEmit

lib/agent/auto-mode.test.ts(448,12): error TS18048: 'endCall' is possibly 'undefined'.
lib/providers/storage/r2.ts(139,9): error TS2322: Type 'X' is not assignable to type 'Y'.
`;
    const summary = summarizeFailure(log);
    expect(summary.typecheck).toHaveLength(2);
    expect(summary.typecheck[0]).toEqual({
      file: 'lib/agent/auto-mode.test.ts',
      line: 448,
      col: 12,
      code: 'TS18048',
      msg: "'endCall' is possibly 'undefined'.",
    });
    expect(summary.typecheck[1].code).toBe('TS2322');
  });

  it('extracts vitest FAIL lines with file > suite > test', () => {
    const log = `
 FAIL  lib/agent/auto-mode.test.ts > runAutoMode · orchestration > forwards a singular legacy referenceImage
 FAIL  tests/unit/research-signals.test.ts > research signal adapters > uses RapidAPI XHS search when configured
`;
    const summary = summarizeFailure(log);
    expect(summary.tests).toHaveLength(2);
    expect(summary.tests[0]).toEqual({
      file: 'lib/agent/auto-mode.test.ts',
      suite: 'runAutoMode · orchestration',
      test: 'forwards a singular legacy referenceImage',
    });
  });

  it('counts total signals across categories', () => {
    const log = `
lib/foo.ts(1,1): error TS2322: foo
 FAIL  lib/bar.test.ts > suite > test
`;
    const summary = summarizeFailure(log);
    expect(summary.totalSignals).toBe(2);
  });

  it('returns zero signals on a log with no recognizable patterns', () => {
    const log = 'Building...\nDone in 12s.\n';
    const summary = summarizeFailure(log);
    expect(summary.totalSignals).toBe(0);
  });
});

describe('formatPacket', () => {
  it('renders typecheck, tests, and lint sections when present', () => {
    const summary = {
      typecheck: [{ file: 'a.ts', line: 1, col: 2, code: 'TS123', msg: 'broken' }],
      tests: [{ file: 'a.test.ts', suite: 'x', test: 'y' }],
      lint: [],
      totalSignals: 2,
    };
    const out = formatPacket({ summary, log: '', runUrl: 'https://example/run' });
    expect(out).toContain('### CI failure packet');
    expect(out).toContain('**Typecheck**');
    expect(out).toContain('`a.ts:1:2` TS123 — broken');
    expect(out).toContain('**Failing tests**');
    expect(out).toContain('`a.test.ts` › x › y');
    expect(out).toContain('[Full log](https://example/run)');
    expect(out).not.toContain('**Lint**'); // empty section omitted
  });

  it('falls back to raw log tail when totalSignals is zero', () => {
    const summary = { typecheck: [], tests: [], lint: [], totalSignals: 0 };
    const out = formatPacket({
      summary,
      log: 'something went wrong but in a weird way',
      runUrl: 'https://example/run',
    });
    expect(out).toContain('No structured failures matched');
    expect(out).toContain('something went wrong');
  });

  it('truncates long sections at 8 entries', () => {
    const tsErrors = Array.from({ length: 12 }, (_, i) => ({
      file: `f${i}.ts`,
      line: i + 1,
      col: 1,
      code: `TS${i}`,
      msg: 'x',
    }));
    const out = formatPacket({
      summary: { typecheck: tsErrors, tests: [], lint: [], totalSignals: 12 },
      log: '',
      runUrl: 'https://example/run',
    });
    // 8 entries + "… 4 more"
    expect(out.match(/`f\d+\.ts:/g)?.length).toBe(8);
    expect(out).toContain('… 4 more');
  });

  it('emits "… N more" for lint too (symmetric with typecheck/tests)', () => {
    const lint = Array.from({ length: 11 }, (_, i) => ({
      file: `f${i}.ts`,
      line: i + 1,
      col: 1,
      severity: 'error',
      msg: 'x',
      rule: 'foo/bar',
    }));
    const out = formatPacket({
      summary: { typecheck: [], tests: [], lint, totalSignals: 11 },
      log: '',
      runUrl: 'https://example/run',
    });
    expect(out.match(/`f\d+\.ts:/g)?.length).toBe(8);
    expect(out).toContain('… 3 more');
  });
});

describe('runOrchestration retry-budget gate', () => {
  function withFakeGh(impl: (args: string[]) => { ok: boolean; stdout: string; error?: string }) {
    __setGhImpl(impl);
    __setGhStdinImpl(() => {
      // No-op: tests don't care about post*Comment side effects here.
    });
  }

  afterEach(() => {
    __setGhImpl(null);
    __setGhStdinImpl(null);
  });

  it('attempt 1 → re-fires the agent label on the issue', async () => {
    const calls: string[][] = [];
    withFakeGh((args) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'view') return { ok: true, stdout: '' };
      return { ok: true, stdout: '' };
    });
    const result = await runOrchestration({
      logPath: '/dev/null',
      prNumber: '999',
      issueNumber: '500',
      branch: 'claude/issue-500-x',
      runId: 'run-abc',
      repo: 'erniesg/aether',
      maxRetries: 2,
      discordWebhook: '',
    });
    expect(result.action).toBe('re-fired');
    expect(result.attemptNumber).toBe(1);
    const labelEdits = calls.filter((c) => c[0] === 'issue' && c[1] === 'edit');
    // Look for the sequential pair `--add-label claude-run`, not just the
    // substrings appearing anywhere in the args (e.g. `--remove-label claude-run`
    // would otherwise produce a false positive).
    const addedClaudeRun = labelEdits.some((c) => {
      for (let i = 0; i < c.length - 1; i++) {
        if (c[i] === '--add-label' && c[i + 1] === 'claude-run') return true;
      }
      return false;
    });
    expect(addedClaudeRun).toBe(true);
  });

  it('attempt > MAX_RETRIES → escalates and does NOT re-fire claude-run', async () => {
    const calls: string[][] = [];
    withFakeGh((args) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'view') {
        return {
          ok: true,
          stdout: ['<!-- ci-failure-attempt:1 -->', '<!-- ci-failure-attempt:2 -->'].join('\n'),
        };
      }
      return { ok: true, stdout: '' };
    });
    const result = await runOrchestration({
      logPath: '/dev/null',
      prNumber: '999',
      issueNumber: '500',
      branch: 'claude/issue-500-x',
      runId: 'run-abc',
      repo: 'erniesg/aether',
      maxRetries: 2,
      discordWebhook: '',
    });
    expect(result.action).toBe('escalated');
    expect(result.attemptNumber).toBe(3);
    const labelEdits = calls.filter((c) => c[0] === 'issue' && c[1] === 'edit');
    // Helper: find a call where the args contain `--add-label X` (sequential
    // pair, not just both substrings present anywhere).
    function hasAddLabelOf(args: string[], label: string): boolean {
      for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === '--add-label' && args[i + 1] === label) return true;
      }
      return false;
    }
    const escalation = labelEdits.find((c) => hasAddLabelOf(c, 'needs-human-review'));
    expect(escalation).toBeDefined();
    // Must NOT have re-added claude-run after escalating.
    const claudeRunRefresh = labelEdits.find((c) => hasAddLabelOf(c, 'claude-run'));
    expect(claudeRunRefresh).toBeUndefined();
  });

  it('gh failure during prior-attempts read → aborts (does NOT loop infinitely)', async () => {
    withFakeGh((args) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return { ok: false, stdout: '', error: 'rate limited' };
      }
      return { ok: true, stdout: '' };
    });
    const result = await runOrchestration({
      logPath: '/dev/null',
      prNumber: '999',
      issueNumber: '500',
      branch: 'claude/issue-500-x',
      runId: 'run-abc',
      repo: 'erniesg/aether',
      maxRetries: 2,
      discordWebhook: '',
    });
    expect(result.action).toBe('aborted');
    expect(result.reason).toBe('gh-call-failed');
    expect(result.error).toBe('rate limited');
  });

  it('codex/issue-* branch → re-fires codex-run (NOT claude-run)', async () => {
    const calls: string[][] = [];
    withFakeGh((args) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'view') return { ok: true, stdout: '' };
      return { ok: true, stdout: '' };
    });
    const result = await runOrchestration({
      logPath: '/dev/null',
      prNumber: '999',
      issueNumber: '500',
      branch: 'codex/issue-500-y',
      runId: 'run-abc',
      repo: 'erniesg/aether',
      maxRetries: 2,
      discordWebhook: '',
    });
    expect(result.action).toBe('re-fired');
    const labelEdits = calls.filter((c) => c[0] === 'issue' && c[1] === 'edit');
    function hasAddLabelOf(args: string[], label: string): boolean {
      for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === '--add-label' && args[i + 1] === label) return true;
      }
      return false;
    }
    const codexRefire = labelEdits.find((c) => hasAddLabelOf(c, 'codex-run'));
    const claudeRefire = labelEdits.find((c) => hasAddLabelOf(c, 'claude-run'));
    expect(codexRefire).toBeDefined();
    expect(claudeRefire).toBeUndefined();
  });

  it('no issue number → returns no-issue-no-refire (cannot re-fire without an issue)', async () => {
    withFakeGh(() => ({ ok: true, stdout: '' }));
    const result = await runOrchestration({
      logPath: '/dev/null',
      prNumber: '999',
      issueNumber: '',
      branch: 'fix/something',
      runId: 'run-abc',
      repo: 'erniesg/aether',
      maxRetries: 2,
      discordWebhook: '',
    });
    expect(result.action).toBe('no-issue-no-refire');
  });
});

describe('countPriorAttempts (return-shape contract)', () => {
  afterEach(() => {
    __setGhImpl(null);
  });

  it('returns { ok: true, count: 0 } when issue number is empty', () => {
    const result = countPriorAttempts('');
    expect(result).toEqual({ ok: true, count: 0 });
  });

  it('returns { ok: true, count: N } when gh succeeds, counting markers', () => {
    __setGhImpl(() => ({
      ok: true,
      stdout: '<!-- ci-failure-attempt:1 -->\n<!-- ci-failure-attempt:2 -->\nblah',
    }));
    const result = countPriorAttempts('500');
    expect(result).toEqual({ ok: true, count: 2 });
  });

  it('returns { ok: false, error } when gh fails (caller must abort, not silently zero)', () => {
    __setGhImpl(() => ({ ok: false, stdout: '', error: 'rate limited' }));
    const result = countPriorAttempts('500');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rate limited');
  });
});
