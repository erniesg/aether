#!/usr/bin/env node
// Queue controller for autonomous author issues.
//
// This keeps GitHub labels as the source of truth. It normalizes contradictory
// queue state labels, detects stale agent runs, applies retry caps, and drains
// queued work in priority order without introducing an operator dashboard.

import { execFileSync } from 'node:child_process';

const QUEUE_CONTROLLER_MARKER_PREFIX = '<!-- aether-queue-controller:v1';
const DEFAULT_STALE_AFTER_HOURS = 4;
const DEFAULT_RETRY_LIMIT = 3;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_HIGH_RISK_CONCURRENT = 1;
const DEFAULT_PUBLIC_WRITE_POLICY = 'after-hours-sgt';
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

const QUEUE_STATES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  AWAITING_REVIEW: 'awaiting-review',
  READY_FOR_HUMAN: 'ready-for-human',
  BLOCKED: 'blocked',
  PAUSED: 'paused',
  DEFERRED: 'deferred',
  DONE: 'done',
  UNMANAGED: 'unmanaged',
};

const QUEUE_STATE_LABELS = {
  [QUEUE_STATES.QUEUED]: 'queue-queued',
  [QUEUE_STATES.RUNNING]: 'queue-running',
  [QUEUE_STATES.AWAITING_REVIEW]: 'queue-awaiting-review',
  [QUEUE_STATES.READY_FOR_HUMAN]: 'queue-ready-human',
  [QUEUE_STATES.BLOCKED]: 'queue-blocked',
  [QUEUE_STATES.PAUSED]: 'queue-paused',
  [QUEUE_STATES.DEFERRED]: 'queue-deferred',
  [QUEUE_STATES.DONE]: 'queue-done',
};

const QUEUE_STATE_LABEL_SET = new Set(Object.values(QUEUE_STATE_LABELS));
const AGENT_LABELS = ['claude-run', 'codex-run'];
const HUMAN_LABELS = ['route-human', 'ready-for-ernie'];
const TERMINAL_BLOCK_LABEL = 'blocked';
const DEPENDS_ON_PR_LABEL = 'depends-on-pr';
const LEGACY_DEPENDS_ON_PR_LABEL = 'depends-on:pr';
const DEPENDS_ON_PR_PATTERN = /^depends-on:pr(?:-\d+)?$/;
const PRIORITY_LABELS = ['priority:p0', 'priority:p1', 'priority:p2', 'priority:p3'];
const HIGH_RISK_LABELS = new Set([
  'risk:ui',
  'risk:product',
  'surface:ui',
  'surface:product',
  'requires-artifacts',
  'qa:media',
  'artifact-required',
]);

function gh(args, { parseJson = false, allowFailure = false } = {}) {
  try {
    const out = execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
    return parseJson ? JSON.parse(out || 'null') : out;
  } catch (error) {
    if (allowFailure) return parseJson ? null : '';
    const stderr = error.stderr?.toString?.().trim();
    const suffix = stderr ? `\n${stderr}` : '';
    throw new Error(`gh ${args.join(' ')} failed${suffix}`);
  }
}

function notice(message) {
  console.log(`::notice::${message}`);
}

function warning(message) {
  console.log(`::warning::${message}`);
}

function labelName(label) {
  return String(typeof label === 'string' ? label : label?.name ?? '').trim().toLowerCase();
}

function normalizeLabels(labels = []) {
  return [...new Set(labels.map(labelName).filter(Boolean))].sort();
}

function dateMs(value) {
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : 0;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasDependencyLabel(labels) {
  return labels.some(
    (label) =>
      label === DEPENDS_ON_PR_LABEL ||
      label === LEGACY_DEPENDS_ON_PR_LABEL ||
      DEPENDS_ON_PR_PATTERN.test(label)
  );
}

function getAgentLabels(labels) {
  return AGENT_LABELS.filter((label) => labels.includes(label));
}

function getIssueNumberFromBranch(ref = '') {
  const match = String(ref ?? '').match(/^(?:claude|codex)\/issue-(\d+)(?:-|$)/);
  return match ? Number(match[1]) : null;
}

function getIssueNumberFromPrBody(body = '') {
  const match = String(body ?? '').match(
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|source issue|issue)\s*:?\s*#(\d+)/i
  );
  return match ? Number(match[1]) : null;
}

function getPriority(item) {
  const labels = normalizeLabels(item.labels);
  const explicit = labels.find((label) => PRIORITY_LABELS.includes(label));
  if (explicit) {
    return {
      label: explicit,
      rank: PRIORITY_LABELS.indexOf(explicit),
    };
  }

  const titleMatch = String(item.title ?? '').match(/\bP([0-3])\b/i);
  if (titleMatch) {
    const label = `priority:p${titleMatch[1]}`;
    return { label, rank: PRIORITY_LABELS.indexOf(label) };
  }

  return { label: 'priority:none', rank: PRIORITY_LABELS.length };
}

function isHighRisk(item) {
  const labels = normalizeLabels([
    ...(item.labels ?? []),
    ...(item.pullRequest?.labels ?? []),
  ]);
  if (labels.some((label) => HIGH_RISK_LABELS.has(label))) return true;
  const paths = item.touchedPaths ?? item.pullRequest?.files ?? [];
  return paths.some((path) =>
    /^(app|components|convex|lib\/(?:agent|brand|capability|context|providers|research|route-human|skill|store|types|video)|tests\/e2e|tests\/artifacts)\//.test(
      String(path)
    )
  );
}

function hasOpenPullRequest(item) {
  return item.pullRequest?.state === 'OPEN' || item.pullRequest?.state === 'open';
}

function hasActiveAgentBranch(item) {
  const branches = item.agentBranches ?? (item.agentBranch ? [item.agentBranch] : []);
  return branches.some((branch) => {
    const name = typeof branch === 'string' ? branch : branch?.name ?? branch?.headRefName ?? '';
    return /^(?:claude|codex)\/issue-\d+-/.test(name) && !hasOpenPullRequest(item);
  });
}

function inferQueueState(item) {
  const labels = normalizeLabels([
    ...(item.labels ?? []),
    ...(item.pullRequest?.labels ?? []),
  ]);
  const labelsSet = new Set(labels);

  if (String(item.state ?? '').toUpperCase() === 'CLOSED' || labelsSet.has(QUEUE_STATE_LABELS.done)) {
    return QUEUE_STATES.DONE;
  }
  if (labelsSet.has(QUEUE_STATE_LABELS[QUEUE_STATES.PAUSED])) return QUEUE_STATES.PAUSED;
  if (
    labelsSet.has(QUEUE_STATE_LABELS[QUEUE_STATES.BLOCKED]) ||
    labelsSet.has(TERMINAL_BLOCK_LABEL) ||
    hasDependencyLabel(labels)
  ) {
    return QUEUE_STATES.BLOCKED;
  }
  if (labelsSet.has(QUEUE_STATE_LABELS[QUEUE_STATES.DEFERRED])) return QUEUE_STATES.DEFERRED;
  if (
    labelsSet.has(QUEUE_STATE_LABELS[QUEUE_STATES.READY_FOR_HUMAN]) ||
    HUMAN_LABELS.some((label) => labelsSet.has(label))
  ) {
    return QUEUE_STATES.READY_FOR_HUMAN;
  }
  if (
    hasOpenPullRequest(item) ||
    labelsSet.has(QUEUE_STATE_LABELS[QUEUE_STATES.AWAITING_REVIEW])
  ) {
    return QUEUE_STATES.AWAITING_REVIEW;
  }
  if (hasActiveAgentBranch(item) || labelsSet.has(QUEUE_STATE_LABELS[QUEUE_STATES.RUNNING])) {
    return QUEUE_STATES.RUNNING;
  }
  if (
    AGENT_LABELS.some((label) => labelsSet.has(label)) ||
    labelsSet.has(QUEUE_STATE_LABELS[QUEUE_STATES.QUEUED])
  ) {
    return QUEUE_STATES.QUEUED;
  }
  return QUEUE_STATES.UNMANAGED;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function normalizeQueueItem(item) {
  const labels = normalizeLabels(item.labels);
  const labelsSet = new Set(labels);
  const state = inferQueueState(item);
  const labelsToAdd = [];
  const labelsToRemove = [];
  const warnings = [];
  const desiredStateLabel = QUEUE_STATE_LABELS[state];

  if (desiredStateLabel && !labelsSet.has(desiredStateLabel)) {
    labelsToAdd.push(desiredStateLabel);
  }

  for (const label of QUEUE_STATE_LABEL_SET) {
    if (label !== desiredStateLabel && labelsSet.has(label)) {
      labelsToRemove.push(label);
    }
  }

  const currentStateLabels = labels.filter((label) => QUEUE_STATE_LABEL_SET.has(label));
  if (currentStateLabels.length > 1) {
    warnings.push(`conflicting queue state labels: ${currentStateLabels.join(', ')}`);
  }

  if (
    [
      QUEUE_STATES.AWAITING_REVIEW,
      QUEUE_STATES.READY_FOR_HUMAN,
      QUEUE_STATES.BLOCKED,
      QUEUE_STATES.PAUSED,
      QUEUE_STATES.DEFERRED,
      QUEUE_STATES.DONE,
    ].includes(state)
  ) {
    for (const label of AGENT_LABELS) {
      if (labelsSet.has(label)) labelsToRemove.push(label);
    }
  }

  if (state === QUEUE_STATES.QUEUED && getAgentLabels(labels).length === 0) {
    warnings.push('queued state has no agent trigger label');
  }

  if (state === QUEUE_STATES.BLOCKED && hasDependencyLabel(labels) && labelsSet.has(TERMINAL_BLOCK_LABEL)) {
    warnings.push('dependency-blocked issue also has terminal blocked label');
  }

  return {
    item,
    state,
    priority: getPriority(item),
    highRisk: isHighRisk(item),
    labelsToAdd: sortedUnique(labelsToAdd),
    labelsToRemove: sortedUnique(labelsToRemove),
    warnings,
  };
}

function getLastProgressMs(item) {
  const candidates = [
    item.lastProgressAt,
    item.pullRequest?.updatedAt,
    item.agentBranch?.updatedAt,
    ...(item.agentBranches ?? []).map((branch) =>
      typeof branch === 'string' ? '' : branch.updatedAt ?? branch.pushedAt
    ),
    item.updatedAt,
    item.createdAt,
  ];
  return Math.max(...candidates.map(dateMs), 0);
}

function parseRetryMarkers(comments = []) {
  let max = 0;
  for (const comment of comments) {
    const body = String(typeof comment === 'string' ? comment : comment?.body ?? '');
    const marker = /<!--\s*aether-(?:queue-controller|ci-failure-router):v1\b(?=[^>]*\bretry=(\d+))[^>]*-->/gi;
    let match;
    while ((match = marker.exec(body)) !== null) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}

function isStaleRun(item, options = {}) {
  const nowMs = dateMs(options.now ?? new Date());
  const staleAfterMs =
    (options.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS) * 60 * 60 * 1000;
  const normalized = normalizeQueueItem(item);
  if (normalized.state !== QUEUE_STATES.RUNNING) return false;
  if (hasOpenPullRequest(item)) return false;
  if (getAgentLabels(normalizeLabels(item.labels)).length === 0) return false;
  const lastProgressMs = getLastProgressMs(item);
  if (!lastProgressMs) return false;
  return nowMs - lastProgressMs > staleAfterMs;
}

function buildQueueMarker({ issueNumber, retryNumber }) {
  return `${QUEUE_CONTROLLER_MARKER_PREFIX} issue=${issueNumber || 'unknown'} retry=${retryNumber} -->`;
}

function buildStaleRunComment({ item, agentLabel, retryNumber, retryLimit, action, reason }) {
  const lines = [
    buildQueueMarker({ issueNumber: item.number, retryNumber }),
    '### Queue controller stale-run packet',
    '',
    `Issue: #${item.number}`,
    `Agent trigger: \`${agentLabel}\``,
    `Retry: ${retryNumber}/${retryLimit}`,
    `Action: ${action}`,
  ];
  if (reason) {
    lines.push(`Reason: ${reason}`);
  }
  if (action === 'retry') {
    lines.push('', 'The controller is refreshing the agent trigger and dispatching the author workflow.');
  } else {
    lines.push('', 'The controller is stopping automation and routing this item to human review.');
  }
  return lines.join('\n');
}

function planStaleRun(item, options = {}) {
  if (!isStaleRun(item, options)) return null;
  const labels = normalizeLabels(item.labels);
  const agentLabel = getAgentLabels(labels)[0] ?? 'claude-run';
  const priorRetryCount = parseRetryMarkers(item.comments);
  const retryLimit = options.retryLimit ?? DEFAULT_RETRY_LIMIT;
  const retryNumber = priorRetryCount + 1;
  const retryCapExhausted = retryNumber > retryLimit;
  const codexRemoteUnavailable = agentLabel === 'codex-run';

  if (retryCapExhausted || codexRemoteUnavailable) {
    const reason = retryCapExhausted
      ? `retry budget exhausted (${priorRetryCount}/${retryLimit} prior retries)`
      : 'Codex subscription work is local-only; GitHub cannot self-heal it remotely';
    return {
      issueNumber: item.number,
      action: 'human',
      agentLabel,
      retryNumber,
      retryLimit,
      labelsToAdd: ['queue-ready-human', 'route-human'],
      labelsToRemove: [...AGENT_LABELS, 'queue-running', 'queue-queued'],
      comment: buildStaleRunComment({
        item,
        agentLabel,
        retryNumber,
        retryLimit,
        action: 'human',
        reason,
      }),
      reason,
    };
  }

  return {
    issueNumber: item.number,
    action: 'retry',
    agentLabel,
    retryNumber,
    retryLimit,
    workflow: agentLabel === 'claude-run' ? 'claude.yml' : 'codex.yml',
    labelsToAdd: ['queue-queued', agentLabel],
    labelsToRemove: ['queue-running', 'queue-awaiting-review', 'queue-ready-human', 'route-human'],
    comment: buildStaleRunComment({
      item,
      agentLabel,
      retryNumber,
      retryLimit,
      action: 'retry',
    }),
  };
}

function compareDispatchCandidates(a, b) {
  const priorityDiff = a.priority.rank - b.priority.rank;
  if (priorityDiff !== 0) return priorityDiff;
  const createdDiff = dateMs(a.item.createdAt) - dateMs(b.item.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return Number(a.item.number ?? 0) - Number(b.item.number ?? 0);
}

function selectAgentLabel(item) {
  const labels = normalizeLabels(item.labels);
  if (labels.includes('claude-run')) return 'claude-run';
  if (labels.includes('codex-run')) return 'codex-run';
  return '';
}

function workflowForAgentLabel(agentLabel) {
  if (agentLabel === 'claude-run') return 'claude.yml';
  if (agentLabel === 'codex-run') return 'codex.yml';
  return '';
}

function selectDispatchCandidates(items, options = {}) {
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const maxHighRiskConcurrent =
    options.maxHighRiskConcurrent ?? DEFAULT_MAX_HIGH_RISK_CONCURRENT;
  const normalized = items.map(normalizeQueueItem);
  let active = normalized.filter((entry) =>
    [QUEUE_STATES.RUNNING, QUEUE_STATES.AWAITING_REVIEW].includes(entry.state)
  ).length;
  let activeHighRisk = normalized.filter(
    (entry) =>
      entry.highRisk &&
      [QUEUE_STATES.RUNNING, QUEUE_STATES.AWAITING_REVIEW].includes(entry.state)
  ).length;

  const selected = [];
  const candidates = normalized
    .filter((entry) => entry.state === QUEUE_STATES.QUEUED)
    .filter((entry) => Boolean(selectAgentLabel(entry.item)))
    .sort(compareDispatchCandidates);

  for (const entry of candidates) {
    if (active >= maxConcurrent) break;
    if (entry.highRisk && activeHighRisk >= maxHighRiskConcurrent) continue;
    const agentLabel = selectAgentLabel(entry.item);
    const workflow = workflowForAgentLabel(agentLabel);
    if (!workflow) continue;
    selected.push({
      issueNumber: entry.item.number,
      priority: entry.priority,
      highRisk: entry.highRisk,
      agentLabel,
      workflow,
      labelsToAdd: ['queue-running'],
      labelsToRemove: ['queue-queued'],
    });
    active += 1;
    if (entry.highRisk) activeHighRisk += 1;
  }

  return selected;
}

function planHumanDecision(item, decision, options = {}) {
  const agentLabel = options.agentLabel || selectAgentLabel(item) || 'claude-run';
  if (decision === 'acknowledge') {
    return {
      issueNumber: item.number,
      decision,
      labelsToAdd: ['queue-queued', agentLabel],
      labelsToRemove: ['queue-ready-human', 'queue-deferred', 'queue-paused', 'route-human'],
      comment: `Human acknowledged #${item.number}; queue is re-opened for \`${agentLabel}\`.`,
    };
  }
  if (decision === 'defer') {
    return {
      issueNumber: item.number,
      decision,
      labelsToAdd: ['queue-deferred'],
      labelsToRemove: [...AGENT_LABELS, 'queue-queued', 'queue-running', 'queue-ready-human', 'route-human'],
      comment: `Human deferred #${item.number}; automation will not dispatch it until acknowledged.`,
    };
  }
  if (decision === 'reject' || decision === 'block') {
    return {
      issueNumber: item.number,
      decision,
      labelsToAdd: ['blocked', 'queue-blocked'],
      labelsToRemove: [...AGENT_LABELS, 'queue-queued', 'queue-running', 'queue-ready-human', 'route-human'],
      comment: `Human ${decision === 'reject' ? 'rejected' : 'blocked'} #${item.number}; automation is stopped.`,
    };
  }
  throw new Error(`Unknown human queue decision: ${decision}`);
}

function buildQueuePlan({ items = [], dispatchQueued = false, ...options } = {}) {
  const normalized = items.map(normalizeQueueItem);
  const staleRuns = items.map((item) => planStaleRun(item, options)).filter(Boolean);
  const dispatches = dispatchQueued ? selectDispatchCandidates(items, options) : [];
  return { normalized, staleRuns, dispatches };
}

function applyLabelChanges(issueNumber, labelsToAdd = [], labelsToRemove = []) {
  const add = sortedUnique(labelsToAdd);
  const remove = sortedUnique(labelsToRemove);
  for (const label of remove) {
    gh(['issue', 'edit', String(issueNumber), '--remove-label', label], { allowFailure: true });
  }
  if (add.length > 0) {
    gh(['issue', 'edit', String(issueNumber), '--add-label', add.join(',')], {
      allowFailure: true,
    });
  }
}

function addIssueComment(issueNumber, body) {
  gh(['issue', 'comment', String(issueNumber), '--body', body]);
}

function dispatchWorkflow(workflow, fields = {}) {
  const defaultBranch = process.env.DEFAULT_BRANCH || process.env.GITHUB_DEFAULT_BRANCH || 'main';
  const args = ['workflow', 'run', workflow, '--ref', defaultBranch];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    args.push('-f', `${key}=${String(value)}`);
  }
  gh(args, { allowFailure: true });
}

function isPublicWriteAllowed(policy = DEFAULT_PUBLIC_WRITE_POLICY, at = new Date()) {
  const normalized = String(policy || DEFAULT_PUBLIC_WRITE_POLICY).trim().toLowerCase();
  if (['always', 'allow', 'allowed'].includes(normalized)) return true;
  if (['never', 'off', 'disabled'].includes(normalized)) return false;
  if (!['after-hours-sgt', 'quiet-working-hours-sgt'].includes(normalized)) return true;

  const sgt = new Date(at.getTime() + SGT_OFFSET_MS);
  const day = sgt.getUTCDay();
  const hour = sgt.getUTCHours();
  const isWeekday = day >= 1 && day <= 5;
  return !(isWeekday && hour >= 9 && hour < 18);
}

function loadOpenPullRequests() {
  return gh(
    [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,title,body,headRefName,labels,updatedAt,url,isDraft',
    ],
    { parseJson: true, allowFailure: true }
  ) ?? [];
}

function loadOpenIssues() {
  return gh(
    [
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,title,body,labels,createdAt,updatedAt,url,state',
    ],
    { parseJson: true, allowFailure: true }
  ) ?? [];
}

function loadIssueComments(issueNumber) {
  if (!issueNumber) return [];
  const comments = gh(
    ['api', `repos/${process.env.GITHUB_REPOSITORY}/issues/${issueNumber}/comments`, '--paginate'],
    { parseJson: true, allowFailure: true }
  );
  return Array.isArray(comments) ? comments : [];
}

function attachPullRequestsToIssues(issues, pullRequests) {
  const issueByNumber = new Map(issues.map((issue) => [Number(issue.number), { ...issue }]));
  for (const pr of pullRequests) {
    const issueNumber =
      getIssueNumberFromBranch(pr.headRefName) || getIssueNumberFromPrBody(pr.body || '');
    if (!issueNumber || !issueByNumber.has(issueNumber)) continue;
    const issue = issueByNumber.get(issueNumber);
    issue.pullRequest = {
      ...pr,
      state: 'OPEN',
      labels: normalizeLabels(pr.labels),
    };
    issueByNumber.set(issueNumber, issue);
  }
  return [...issueByNumber.values()];
}

function loadQueueItems() {
  const issues = loadOpenIssues();
  const prs = loadOpenPullRequests();
  const items = attachPullRequestsToIssues(issues, prs);
  const now = new Date();
  return items.map((item) => {
    const maybeStale = isStaleRun(item, { now });
    if (!maybeStale) return item;
    return { ...item, comments: loadIssueComments(item.number) };
  });
}

function executeQueuePlan(plan, { dryRun = false, allowWrites = true } = {}) {
  for (const entry of plan.normalized) {
    if (entry.labelsToAdd.length === 0 && entry.labelsToRemove.length === 0) continue;
    notice(
      `normalize #${entry.item.number}: state=${entry.state} add=[${entry.labelsToAdd.join(',')}] remove=[${entry.labelsToRemove.join(',')}]`
    );
    if (!dryRun && allowWrites) {
      applyLabelChanges(entry.item.number, entry.labelsToAdd, entry.labelsToRemove);
    }
  }

  for (const stale of plan.staleRuns) {
    warning(`stale #${stale.issueNumber}: ${stale.action}`);
    if (!dryRun && allowWrites) {
      applyLabelChanges(stale.issueNumber, stale.labelsToAdd, stale.labelsToRemove);
      addIssueComment(stale.issueNumber, stale.comment);
      if (stale.action === 'retry' && stale.workflow) {
        dispatchWorkflow(stale.workflow, { issue_number: stale.issueNumber });
      }
    }
  }

  for (const dispatch of plan.dispatches) {
    notice(
      `dispatch #${dispatch.issueNumber}: ${dispatch.workflow} priority=${dispatch.priority.label} highRisk=${dispatch.highRisk}`
    );
    if (!dryRun && allowWrites) {
      applyLabelChanges(dispatch.issueNumber, dispatch.labelsToAdd, dispatch.labelsToRemove);
      dispatchWorkflow(dispatch.workflow, { issue_number: dispatch.issueNumber });
    }
  }
}

async function main(env = process.env) {
  if (!env.GITHUB_REPOSITORY) throw new Error('GITHUB_REPOSITORY is required');
  const eventName = env.GITHUB_EVENT_NAME || '';
  const dispatchOverride = String(env.QUEUE_CONTROLLER_DISPATCH || '').toLowerCase();
  const dispatchQueued =
    dispatchOverride === 'true' ||
    (dispatchOverride !== 'false' &&
      (eventName === 'schedule' || eventName === 'workflow_dispatch'));
  const dryRun = env.QUEUE_CONTROLLER_DRY_RUN === 'true';
  const allowWrites = isPublicWriteAllowed(env.AETHER_PUBLIC_WRITE_POLICY || DEFAULT_PUBLIC_WRITE_POLICY);
  if (!allowWrites) {
    notice(
      `Public GitHub writes paused by AETHER_PUBLIC_WRITE_POLICY=${env.AETHER_PUBLIC_WRITE_POLICY || DEFAULT_PUBLIC_WRITE_POLICY}.`
    );
  }

  const items = loadQueueItems();
  const plan = buildQueuePlan({
    items,
    dispatchQueued,
    now: new Date(),
    staleAfterHours: parseInteger(env.QUEUE_STALE_AFTER_HOURS, DEFAULT_STALE_AFTER_HOURS),
    retryLimit: parseInteger(env.QUEUE_RETRY_LIMIT, DEFAULT_RETRY_LIMIT),
    maxConcurrent: parseInteger(env.QUEUE_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT),
    maxHighRiskConcurrent: parseInteger(
      env.QUEUE_MAX_HIGH_RISK_CONCURRENT,
      DEFAULT_MAX_HIGH_RISK_CONCURRENT
    ),
  });
  executeQueuePlan(plan, { dryRun, allowWrites });
}

if (process.argv[1]?.endsWith('queue-controller.mjs')) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}

export {
  QUEUE_CONTROLLER_MARKER_PREFIX,
  QUEUE_STATES,
  QUEUE_STATE_LABELS,
  AGENT_LABELS,
  normalizeLabels,
  hasDependencyLabel,
  inferQueueState,
  normalizeQueueItem,
  getPriority,
  isHighRisk,
  parseRetryMarkers,
  isStaleRun,
  planStaleRun,
  selectDispatchCandidates,
  planHumanDecision,
  buildQueuePlan,
  isPublicWriteAllowed,
  getIssueNumberFromBranch,
  getIssueNumberFromPrBody,
  attachPullRequestsToIssues,
};
