import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeFailure, formatPacket } from '../../.github/scripts/route-ci-failure.mjs';

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

  it('refreshes claude-run by removing + re-adding the label', () => {
    expect(routeScript).toContain("'--remove-label', 'claude-run'");
    expect(routeScript).toContain("'--add-label', 'claude-run'");
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

  it('caps each section at 8 entries to keep the packet compact', () => {
    expect(routeScript).toContain('.slice(0, 8)');
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
});
