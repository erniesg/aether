import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const controllerPath = resolve(process.cwd(), '.github/scripts/queue-controller.mjs');
const workflowPath = resolve(process.cwd(), '.github/workflows/queue-controller.yml');
const labelsPath = resolve(process.cwd(), '.github/scripts/create-review-labels.sh');
const autoQueuePath = resolve(process.cwd(), '.github/workflows/auto-queue.yml');

const workflow = readFileSync(workflowPath, 'utf8');
const labelsScript = readFileSync(labelsPath, 'utf8');
const autoQueueWorkflow = readFileSync(autoQueuePath, 'utf8');

async function loadController() {
  return import(pathToFileURL(controllerPath).href);
}

describe('queue-controller state model', () => {
  it('normalizes contradictory labels into one inferred queue state', async () => {
    const controller = await loadController();
    const normalized = controller.normalizeQueueItem({
      number: 152,
      title: 'P1 autoloop: queue controller',
      labels: ['claude-run', 'queue-running', 'queue-paused', 'queue-ready-human'],
      updatedAt: '2026-05-06T10:00:00Z',
    });

    expect(normalized.state).toBe(controller.QUEUE_STATES.PAUSED);
    expect(normalized.labelsToAdd).toEqual([]);
    expect(normalized.labelsToRemove).toEqual([
      'claude-run',
      'queue-ready-human',
      'queue-running',
    ]);
    expect(normalized.warnings.join('\n')).toContain('conflicting queue state labels');
  });

  it('treats dependency labels and terminal blocked labels as non-dispatchable', async () => {
    const controller = await loadController();
    expect(
      controller.inferQueueState({
        number: 90,
        labels: ['depends-on-pr', 'claude-run'],
      })
    ).toBe(controller.QUEUE_STATES.BLOCKED);
    expect(
      controller.inferQueueState({
        number: 91,
        labels: ['depends-on:pr-57', 'claude-run'],
      })
    ).toBe(controller.QUEUE_STATES.BLOCKED);
  });

  it('links agent PR branches back to source issues for awaiting-review inference', async () => {
    const controller = await loadController();
    const [issue] = controller.attachPullRequestsToIssues(
      [
        {
          number: 152,
          title: 'queue controller',
          labels: ['queue-running'],
        },
      ],
      [
        {
          number: 200,
          headRefName: 'claude/issue-152-queue-controller',
          state: 'OPEN',
          labels: [],
        },
      ]
    );

    expect(controller.inferQueueState(issue)).toBe(controller.QUEUE_STATES.AWAITING_REVIEW);
    const normalized = controller.normalizeQueueItem(issue);
    expect(normalized.labelsToAdd).toEqual(['queue-awaiting-review']);
    expect(normalized.labelsToRemove).toEqual(['queue-running']);
  });
});

describe('queue-controller stale runs and retry caps', () => {
  it('refreshes stale Claude work until the retry cap is reached', async () => {
    const controller = await loadController();
    const item = {
      number: 152,
      title: 'P1 queue controller',
      labels: ['claude-run', 'queue-running'],
      updatedAt: '2026-05-06T00:00:00Z',
      comments: ['<!-- aether-queue-controller:v1 issue=152 retry=1 -->'],
    };
    const plan = controller.planStaleRun(item, {
      now: new Date('2026-05-06T08:30:00Z'),
      staleAfterHours: 4,
      retryLimit: 3,
    });

    expect(plan).toMatchObject({
      action: 'retry',
      issueNumber: 152,
      agentLabel: 'claude-run',
      retryNumber: 2,
      retryLimit: 3,
      workflow: 'claude.yml',
    });
    expect(plan.labelsToAdd).toContain('queue-queued');
    expect(plan.labelsToRemove).toContain('queue-running');
    expect(plan.comment).toContain('Queue controller stale-run packet');
  });

  it('does not classify old queued labels as stale runs outside the drain path', async () => {
    const controller = await loadController();
    expect(
      controller.isStaleRun(
        {
          number: 53,
          title: 'Variant swimlane',
          labels: ['claude-run', 'queue-queued'],
          updatedAt: '2026-04-25T00:00:00Z',
        },
        {
          now: new Date('2026-05-06T08:30:00Z'),
          staleAfterHours: 4,
        }
      )
    ).toBe(false);
  });

  it('routes stale work to human when retry budget is exhausted', async () => {
    const controller = await loadController();
    const item = {
      number: 153,
      title: 'P1 JIT context',
      labels: ['claude-run', 'queue-running'],
      updatedAt: '2026-05-06T00:00:00Z',
      comments: [
        '<!-- aether-ci-failure-router:v1 issue=153 pr=201 run_id=1 retry=1 -->',
        '<!-- aether-queue-controller:v1 issue=153 retry=3 -->',
      ],
    };
    const plan = controller.planStaleRun(item, {
      now: new Date('2026-05-06T08:30:00Z'),
      staleAfterHours: 4,
      retryLimit: 3,
    });

    expect(controller.parseRetryMarkers(item.comments)).toBe(3);
    expect(plan).toMatchObject({
      action: 'human',
      issueNumber: 153,
      retryNumber: 4,
      reason: expect.stringContaining('retry budget exhausted'),
    });
    expect(plan.labelsToAdd).toEqual(['queue-ready-human', 'route-human']);
    expect(plan.labelsToRemove).toContain('claude-run');
  });

  it('does not pretend stale Codex subscription work can be repaired remotely', async () => {
    const controller = await loadController();
    const plan = controller.planStaleRun(
      {
        number: 154,
        title: 'Codex local patch',
        labels: ['codex-run', 'queue-running'],
        updatedAt: '2026-05-06T00:00:00Z',
        comments: [],
      },
      {
        now: new Date('2026-05-06T08:30:00Z'),
        staleAfterHours: 4,
        retryLimit: 3,
      }
    );

    expect(plan).toMatchObject({
      action: 'human',
      agentLabel: 'codex-run',
      reason: expect.stringContaining('local-only'),
    });
  });
});

describe('queue-controller dispatch order and human decisions', () => {
  it('orders dispatch by priority and respects high-risk concurrency caps', async () => {
    const controller = await loadController();
    const selected = controller.selectDispatchCandidates(
      [
        {
          number: 1,
          title: 'P2 normal docs',
          labels: ['claude-run'],
          createdAt: '2026-05-01T00:00:00Z',
        },
        {
          number: 2,
          title: 'P0 product route',
          labels: ['claude-run', 'risk:ui'],
          createdAt: '2026-05-02T00:00:00Z',
        },
        {
          number: 3,
          title: 'P1 older product route',
          labels: ['claude-run', 'risk:product'],
          createdAt: '2026-05-01T00:00:00Z',
        },
      ],
      {
        maxConcurrent: 2,
        maxHighRiskConcurrent: 1,
      }
    );

    expect(selected.map((entry: { issueNumber: number }) => entry.issueNumber)).toEqual([2, 1]);
    expect(selected[0]).toMatchObject({
      workflow: 'claude.yml',
      highRisk: true,
      priority: { label: 'priority:p0' },
    });
  });

  it('keeps paused, deferred, blocked, and human-ready issues out of dispatch', async () => {
    const controller = await loadController();
    const selected = controller.selectDispatchCandidates([
      { number: 1, labels: ['claude-run', 'queue-paused'] },
      { number: 2, labels: ['claude-run', 'queue-deferred'] },
      { number: 3, labels: ['claude-run', 'blocked'] },
      { number: 4, labels: ['claude-run', 'route-human'] },
      { number: 5, labels: ['claude-run'] },
    ]);

    expect(selected.map((entry: { issueNumber: number }) => entry.issueNumber)).toEqual([5]);
  });

  it('models acknowledge, defer, and reject/block human decisions', async () => {
    const controller = await loadController();
    const item = { number: 80, labels: ['route-human', 'queue-ready-human'] };

    expect(controller.planHumanDecision(item, 'acknowledge')).toMatchObject({
      labelsToAdd: ['queue-queued', 'claude-run'],
      labelsToRemove: expect.arrayContaining(['route-human', 'queue-ready-human']),
    });
    expect(controller.planHumanDecision(item, 'defer')).toMatchObject({
      labelsToAdd: ['queue-deferred'],
      labelsToRemove: expect.arrayContaining(['route-human']),
    });
    expect(controller.planHumanDecision(item, 'reject')).toMatchObject({
      labelsToAdd: ['blocked', 'queue-blocked'],
      labelsToRemove: expect.arrayContaining(['route-human']),
    });
  });
});

describe('queue-controller workflow contract', () => {
  it('runs from the default branch with write permissions only for queue routing', () => {
    expect(workflow).toContain('name: queue-controller');
    expect(workflow).toContain('node .github/scripts/queue-controller.mjs');
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('pull-requests: read');
    expect(workflow).toContain('actions: write');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(workflow).toContain('github.event.pull_request.head.ref');
    expect(workflow).toContain("github.event.repository.default_branch || 'main'");
    expect(workflow).toContain('AETHER_PUBLIC_WRITE_POLICY');
  });

  it('bootstraps the canonical state and priority labels', () => {
    for (const label of [
      'queue-queued',
      'queue-running',
      'queue-awaiting-review',
      'queue-ready-human',
      'queue-blocked',
      'queue-paused',
      'queue-deferred',
      'queue-done',
      'priority:p0',
      'priority:p1',
      'priority:p2',
      'priority:p3',
      'depends-on-pr',
    ]) {
      expect(labelsScript).toContain(`"${label}"`);
    }
  });

  it('unblocks dependency releases into canonical queued state', () => {
    expect(autoQueueWorkflow).toContain('--remove-label queue-blocked');
    expect(autoQueueWorkflow).toContain('--add-label queue-queued');
    expect(autoQueueWorkflow).toContain('--add-label claude-run');
  });
});
