import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const routerPath = resolve(process.cwd(), '.github/scripts/ci-failure-router.mjs');
const workflowPath = resolve(process.cwd(), '.github/workflows/ci-failure-router.yml');
const routeHumanWorkflowPath = resolve(process.cwd(), '.github/workflows/route-human-review.yml');
const notifyDiscordPath = resolve(process.cwd(), '.github/scripts/notify-discord-human-review.mjs');
const routerSource = readFileSync(routerPath, 'utf8');
const workflow = readFileSync(workflowPath, 'utf8');
const routeHumanWorkflow = readFileSync(routeHumanWorkflowPath, 'utf8');
const notifyDiscordSource = readFileSync(notifyDiscordPath, 'utf8');

describe('CI failure router contract', () => {
  it('builds a repair packet and retry plan for parseable Claude CI failures', async () => {
    const router = await import(pathToFileURL(routerPath).href);
    const run = {
      id: '12345',
      name: 'ci',
      url: 'https://github.com/erniesg/aether/actions/runs/12345',
      conclusion: 'failure',
      headBranch: 'claude/issue-147-ci-self-heal',
      jobs: [
        {
          name: 'verify',
          conclusion: 'failure',
          steps: [{ name: 'npm run typecheck', conclusion: 'failure' }],
        },
      ],
    };
    const log = [
      '2026-05-06T12:00:00Z ##[group]Run npm run typecheck',
      'lib/agent/auto-mode.test.ts(539,12): error TS18048: endCall is possibly undefined.',
      'Error: Process completed with exit code 2.',
    ].join('\n');
    const plan = router.buildRoutingPlan({
      run,
      pr: {
        number: 143,
        title: 'feat: structured CI failure router',
        url: 'https://github.com/erniesg/aether/pull/143',
        body: 'Closes #147',
        headRefName: 'claude/issue-147-ci-self-heal',
      },
      comments: [],
      log,
      retryLimit: 3,
      baseBackoffSeconds: 10,
      maxBackoffSeconds: 60,
    });

    expect(plan).toMatchObject({
      action: 'retry',
      issueNumber: 147,
      retryNumber: 1,
      retryLimit: 3,
      agentLabel: 'claude-run',
      backoffSeconds: 10,
      command: 'npm run typecheck',
    });
    expect(plan.excerpt).toContain('endCall is possibly undefined');
    expect(router.buildRepairComment(plan)).toContain('CI failure repair packet');
    expect(router.buildRepairComment(plan)).toContain('refresh `claude-run`');
  });

  it('routes to human when the source issue cannot be resolved', async () => {
    const router = await import(pathToFileURL(routerPath).href);
    const plan = router.buildRoutingPlan({
      run: {
        id: '999',
        conclusion: 'failure',
        headBranch: 'claude/work-without-issue',
        jobs: [{ name: 'verify', conclusion: 'failure' }],
      },
      pr: {
        number: 200,
        url: 'https://github.com/erniesg/aether/pull/200',
        body: 'No issue link here.',
        headRefName: 'claude/work-without-issue',
      },
      comments: [],
      log: 'Error: Process completed with exit code 2.',
    });

    expect(plan).toMatchObject({
      action: 'human',
      humanReason: expect.stringContaining('source issue'),
    });
    expect(router.buildRepairComment(plan)).toContain('adding `route-human`');
  });

  it('routes to human when the retry cap is exhausted', async () => {
    const router = await import(pathToFileURL(routerPath).href);
    const comments = [
      '<!-- aether-ci-failure-router:v1 issue=147 pr=143 run_id=1 retry=1 -->',
      '<!-- aether-ci-failure-router:v1 issue=147 pr=143 run_id=2 retry=2 -->',
      '<!-- aether-ci-failure-router:v1 issue=147 pr=143 run_id=3 retry=3 -->',
    ].map((body) => ({ body }));
    const plan = router.buildRoutingPlan({
      run: {
        id: '4',
        conclusion: 'failure',
        headBranch: 'claude/issue-147-ci-self-heal',
        jobs: [{ name: 'verify', conclusion: 'failure' }],
      },
      pr: {
        number: 143,
        url: 'https://github.com/erniesg/aether/pull/143',
        body: 'Closes #147',
        headRefName: 'claude/issue-147-ci-self-heal',
      },
      comments,
      log: 'Error: Process completed with exit code 2.',
      retryLimit: 3,
    });

    expect(router.getPriorRetryCount(comments)).toBe(3);
    expect(plan).toMatchObject({
      action: 'human',
      retryNumber: 4,
      humanReason: expect.stringContaining('retry budget exhausted'),
    });
  });

  it('does not pretend local Codex branches can self-heal remotely', async () => {
    const router = await import(pathToFileURL(routerPath).href);
    const plan = router.buildRoutingPlan({
      run: {
        id: '5',
        conclusion: 'failure',
        headBranch: 'codex/issue-147-local-patch',
        jobs: [{ name: 'verify', conclusion: 'failure' }],
      },
      comments: [],
      log: 'Error: Process completed with exit code 2.',
    });

    expect(plan).toMatchObject({
      action: 'ignore',
      reason: expect.stringContaining('local Codex-authored'),
    });
  });

  it('ignores cross-repository PRs even when the branch name matches', async () => {
    const router = await import(pathToFileURL(routerPath).href);
    const plan = router.buildRoutingPlan({
      run: {
        id: '6',
        conclusion: 'failure',
        headBranch: 'claude/issue-147-from-fork',
        jobs: [{ name: 'verify', conclusion: 'failure' }],
      },
      pr: {
        number: 300,
        isCrossRepository: true,
        body: 'Closes #147',
        headRefName: 'claude/issue-147-from-fork',
      },
      comments: [],
      log: 'Error: Process completed with exit code 2.',
    });

    expect(plan).toMatchObject({
      action: 'ignore',
      reason: expect.stringContaining('cross-repository'),
    });
  });

  it('redacts common token shapes before posting logs', async () => {
    const router = await import(pathToFileURL(routerPath).href);
    const excerpt = router.extractFailureExcerpt(
      'Error: failed with token=super-secret and Bearer abcdefghijklmnopqrstuvwxyz123456'
    );

    expect(excerpt).toContain('token=[redacted]');
    expect(excerpt).toContain('Bearer [token-redacted]');
    expect(excerpt).not.toContain('super-secret');
    expect(excerpt).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('wires a workflow_run listener for ci.yml failures with write permission only for routing', () => {
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain("workflows: ['ci']");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(workflow).toContain('node .github/scripts/ci-failure-router.mjs');
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('actions: write');
    expect(workflow).not.toContain('contents: write');
    expect(routerSource).toContain('ROUTER_MARKER_PREFIX');
    expect(routerSource).toContain('refreshLabel(issueTarget, plan.agentLabel)');
    expect(routerSource).toContain("dispatchWorkflow('claude.yml'");
    expect(routerSource).toContain("dispatchWorkflow('route-human-review.yml'");
  });

  it('lets route-human notifications be dispatched explicitly after bot-authored labels', () => {
    expect(routeHumanWorkflow).toContain('workflow_dispatch:');
    expect(routeHumanWorkflow).toContain('target_type:');
    expect(routeHumanWorkflow).toContain('target_number:');
    expect(routeHumanWorkflow).toContain('HUMAN_REVIEW_TARGET_TYPE');
    expect(routeHumanWorkflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(notifyDiscordSource).toContain('function loadManualTarget');
    expect(notifyDiscordSource).toContain("gh(['pr', 'view'");
    expect(notifyDiscordSource).toContain("gh(['issue', 'view'");
  });
});
