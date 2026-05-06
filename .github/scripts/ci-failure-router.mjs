#!/usr/bin/env node
// CI failure router for autonomous author PRs.
//
// Invoked by .github/workflows/ci-failure-router.yml after ci.yml completes.
// Routine typecheck/test/build failures should re-enter the author loop with a
// compact repair packet. Humans only get paged when the router cannot identify
// the source issue or the retry budget is exhausted.

import { execFileSync } from 'node:child_process';

const ROUTER_MARKER_PREFIX = '<!-- aether-ci-failure-router:v1';
const AGENT_BRANCH_PATTERN = /^(claude|codex)\/issue-(\d+)-/;
const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required']);
const MAX_EXCERPT_CHARS = 6000;
const DEFAULT_RETRY_LIMIT = 3;
const DEFAULT_BACKOFF_SECONDS = 30;
const DEFAULT_MAX_BACKOFF_SECONDS = 300;

function truncate(value, limit = MAX_EXCERPT_CHARS) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} chars]`;
}

function redactSensitive(value) {
  return String(value ?? '')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, 'gh[token-redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, 'sk-[redacted]')
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]{12,})\b/g, 'xox[token-redacted]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]{20,}\b/gi, '$1[token-redacted]')
    .replace(/\b((?:api[_-]?key|token|password|secret)=)[^\s&]+/gi, '$1[redacted]');
}

function gh(args, { parseJson = false, allowFailure = false } = {}) {
  try {
    const out = execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    });
    return parseJson ? JSON.parse(out) : out.trim();
  } catch (error) {
    if (allowFailure) return parseJson ? null : '';
    const stdout = error.stdout?.toString?.() ?? '';
    const stderr = error.stderr?.toString?.() ?? '';
    throw new Error(`gh ${args.join(' ')} failed\n${truncate(`${stdout}${stderr}`.trim())}`);
  }
}

function sleep(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, value * 1000));
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBranch(ref = '') {
  return String(ref ?? '').trim().replace(/^refs\/heads\//, '').replace(/^origin\//, '');
}

function parseAgentBranch(ref = '') {
  const branch = normalizeBranch(ref);
  const match = branch.match(AGENT_BRANCH_PATTERN);
  if (!match) return null;
  const agent = match[1];
  return {
    agent,
    branch,
    issueNumber: Number(match[2]),
    agentLabel: agent === 'claude' ? 'claude-run' : 'codex-run',
  };
}

function extractIssueNumberFromPrBody(body = '') {
  const match = String(body ?? '').match(
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|source issue|issue)\s*:?\s*#(\d+)/i
  );
  return match ? Number(match[1]) : null;
}

function normalizeRunContext(run = {}) {
  return {
    id: String(run.id ?? run.databaseId ?? run.runId ?? ''),
    name: run.name || run.workflowName || 'ci',
    url: run.url || run.htmlUrl || '',
    conclusion: String(run.conclusion ?? '').toLowerCase(),
    headBranch: normalizeBranch(run.headBranch || run.head_branch || ''),
    headSha: run.headSha || run.head_sha || '',
    jobs: Array.isArray(run.jobs) ? run.jobs : [],
  };
}

function isFailedConclusion(conclusion) {
  return FAILURE_CONCLUSIONS.has(String(conclusion ?? '').toLowerCase());
}

function extractFailedJobs(run = {}) {
  return normalizeRunContext(run).jobs
    .filter((job) => isFailedConclusion(job.conclusion))
    .map((job) => {
      const failedStep = Array.isArray(job.steps)
        ? job.steps.find((step) => isFailedConclusion(step.conclusion))
        : null;
      return {
        name: job.name || 'unknown job',
        conclusion: String(job.conclusion || 'failure').toLowerCase(),
        databaseId: job.databaseId || job.id || '',
        step: failedStep?.name || '',
      };
    });
}

function stripLogLinePrefix(line) {
  return String(line ?? '')
    .replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s+/, '')
    .replace(/^[^|\t]+\|/, '')
    .replace(/^[^\t]+\t/, '')
    .trimEnd();
}

function extractFailureCommand(log = '') {
  const lines = String(log ?? '').split('\n').map(stripLogLinePrefix);
  for (const line of lines) {
    const match = line.match(/(?:^|##\[group\])Run\s+(.+)$/);
    if (match?.[1]) return redactSensitive(match[1].trim());
  }
  for (const line of lines) {
    const match = line.match(/\b(npm|pnpm|yarn|npx|node|tsx|tsc|vitest|playwright)\s+.+/);
    if (match?.[0]) return redactSensitive(match[0].trim());
  }
  return '';
}

function isUsefulLogLine(line) {
  const trimmed = stripLogLinePrefix(line).trim();
  if (!trimmed) return false;
  if (/^\d+s$/.test(trimmed)) return false;
  if (/^(shell:|env:|working-directory:)/i.test(trimmed)) return false;
  return true;
}

function extractFailureExcerpt(log = '', limit = MAX_EXCERPT_CHARS) {
  const lines = String(log ?? '').split('\n');
  const importantIndexes = [];
  const importantPattern =
    /(error|failed|failure|exception|traceback|typeerror|assertionerror|timed out|timeout|possibly .*undefined|expected|received|exit code|ERR!|npm ERR!|✘|×)/i;

  lines.forEach((line, index) => {
    if (importantPattern.test(line)) importantIndexes.push(index);
  });

  const selected = new Map();
  if (importantIndexes.length > 0) {
    for (const index of importantIndexes) {
      const start = Math.max(0, index - 3);
      const end = Math.min(lines.length - 1, index + 6);
      for (let i = start; i <= end; i += 1) {
        if (isUsefulLogLine(lines[i])) selected.set(i, stripLogLinePrefix(lines[i]));
      }
    }
  } else {
    const tail = lines.filter(isUsefulLogLine).slice(-80).map(stripLogLinePrefix);
    tail.forEach((line, index) => selected.set(index, line));
  }

  const excerpt = [...selected.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, line]) => line)
    .join('\n')
    .trim();
  return truncate(redactSensitive(excerpt || '(no failed log excerpt available)'), limit);
}

function parseRouterMarker(body = '') {
  const marker = String(body ?? '').match(
    /<!--\s*aether-ci-failure-router:v1\b(?=[^>]*\bretry=(\d+))(?=[^>]*\brun_id=([^\s>]+))[^>]*-->/i
  );
  if (!marker) return null;
  return {
    retry: Number(marker[1]),
    runId: marker[2],
  };
}

function getPriorRetryCount(comments = []) {
  return comments.reduce((max, comment) => {
    const parsed = parseRouterMarker(comment.body || comment);
    return parsed ? Math.max(max, parsed.retry) : max;
  }, 0);
}

function calculateBackoffSeconds(retryNumber, baseSeconds = DEFAULT_BACKOFF_SECONDS, maxSeconds = DEFAULT_MAX_BACKOFF_SECONDS) {
  const base = Math.max(0, Number(baseSeconds) || 0);
  const max = Math.max(0, Number(maxSeconds) || 0);
  if (base === 0 || max === 0) return 0;
  return Math.min(max, base * 2 ** Math.max(0, retryNumber - 1));
}

function resolveIssueNumber({ branchInfo, pr }) {
  return branchInfo?.issueNumber || extractIssueNumberFromPrBody(pr?.body || '');
}

function buildMarker({ issueNumber, prNumber, runId, retryNumber }) {
  return `${ROUTER_MARKER_PREFIX} issue=${issueNumber || 'unknown'} pr=${prNumber || 'unknown'} run_id=${runId || 'unknown'} retry=${retryNumber} -->`;
}

function formatFailedJobs(failedJobs = [], command = '') {
  if (failedJobs.length === 0) {
    return `- unknown job${command ? ` · \`${command}\`` : ''}`;
  }
  return failedJobs
    .map((job) => {
      const bits = [`- ${job.name}`];
      if (job.step) bits.push(`step: ${job.step}`);
      if (command) bits.push(`command: \`${command}\``);
      bits.push(`conclusion: ${job.conclusion}`);
      return bits.join(' · ');
    })
    .join('\n');
}

function buildRepairComment(plan) {
  const prLine = plan.pr
    ? `PR: #${plan.pr.number} ${plan.pr.url}`
    : 'PR: not found; routing from branch only';
  const runLine = plan.run.url ? `Run: [${plan.run.name} #${plan.run.id}](${plan.run.url})` : `Run: ${plan.run.name} #${plan.run.id}`;
  const nextAction =
    plan.action === 'retry'
      ? `The router will wait ${plan.backoffSeconds}s, refresh \`${plan.agentLabel}\` on issue #${plan.issueNumber}, and let the author agent repair the PR.`
      : `The router is adding \`route-human\` because ${plan.humanReason}.`;

  return [
    buildMarker({
      issueNumber: plan.issueNumber,
      prNumber: plan.pr?.number,
      runId: plan.run.id,
      retryNumber: plan.retryNumber,
    }),
    '### CI failure repair packet',
    '',
    `Source issue: ${plan.issueNumber ? `#${plan.issueNumber}` : 'unknown'}`,
    prLine,
    `Branch: \`${plan.branch}\``,
    runLine,
    `Retry: ${plan.retryNumber}/${plan.retryLimit}`,
    `Conclusion: ${plan.run.conclusion}`,
    '',
    'Failing jobs:',
    formatFailedJobs(plan.failedJobs, plan.command),
    '',
    'Failure excerpt:',
    '',
    '```text',
    plan.excerpt,
    '```',
    '',
    'Next action:',
    nextAction,
    '',
    'Context bundle:',
    'The next author context bundle at `.agent-context/author-context.md` will include this repair packet; the author agent must read it before editing.',
  ].join('\n');
}

function buildRoutingPlan({
  run,
  pr = null,
  comments = [],
  log = '',
  retryLimit = DEFAULT_RETRY_LIMIT,
  baseBackoffSeconds = DEFAULT_BACKOFF_SECONDS,
  maxBackoffSeconds = DEFAULT_MAX_BACKOFF_SECONDS,
} = {}) {
  const normalizedRun = normalizeRunContext(run);
  const branch = normalizedRun.headBranch || normalizeBranch(pr?.headRefName || '');
  const branchInfo = parseAgentBranch(branch);

  if (!isFailedConclusion(normalizedRun.conclusion)) {
    return { action: 'ignore', reason: `ci conclusion ${normalizedRun.conclusion || 'unknown'} is not retryable` };
  }
  if (pr?.isCrossRepository) {
    return { action: 'ignore', reason: 'cross-repository PRs are not eligible for autonomous CI self-heal' };
  }
  if (!branchInfo && branch.startsWith('claude/')) {
    const priorRetryCount = getPriorRetryCount(comments);
    const retryNumber = priorRetryCount + 1;
    return {
      action: 'human',
      branch,
      agent: 'claude',
      agentLabel: 'claude-run',
      issueNumber: null,
      pr,
      run: normalizedRun,
      failedJobs: extractFailedJobs(normalizedRun),
      command: extractFailureCommand(log),
      excerpt: extractFailureExcerpt(log),
      priorRetryCount,
      retryNumber,
      retryLimit,
      backoffSeconds: 0,
      humanReason: 'automation could not identify a source issue to re-dispatch',
    };
  }
  if (!branchInfo) {
    return { action: 'ignore', reason: `branch ${branch || '(unknown)'} is not an autonomous author branch` };
  }
  if (branchInfo.agent !== 'claude') {
    return {
      action: 'ignore',
      reason: `branch ${branchInfo.branch} is local Codex-authored; remote self-heal is not available for Codex subscription work`,
    };
  }

  const issueNumber = resolveIssueNumber({ branchInfo, pr });
  const priorRetryCount = getPriorRetryCount(comments);
  const retryNumber = priorRetryCount + 1;
  const failedJobs = extractFailedJobs(normalizedRun);
  const command = extractFailureCommand(log);
  const excerpt = extractFailureExcerpt(log);
  const basePlan = {
    action: 'retry',
    branch: branchInfo.branch,
    agent: branchInfo.agent,
    agentLabel: branchInfo.agentLabel,
    issueNumber,
    pr,
    run: normalizedRun,
    failedJobs,
    command,
    excerpt,
    priorRetryCount,
    retryNumber,
    retryLimit,
    backoffSeconds: calculateBackoffSeconds(retryNumber, baseBackoffSeconds, maxBackoffSeconds),
    humanReason: '',
  };

  if (!issueNumber) {
    return {
      ...basePlan,
      action: 'human',
      humanReason: 'automation could not identify a source issue to re-dispatch',
      backoffSeconds: 0,
    };
  }

  if (retryNumber > retryLimit) {
    return {
      ...basePlan,
      action: 'human',
      humanReason: `retry budget exhausted (${priorRetryCount}/${retryLimit} previous attempts)`,
      backoffSeconds: 0,
    };
  }

  return basePlan;
}

function targetNumber(target) {
  return String(target?.number ?? target);
}

function addLabels(target, labels) {
  if (!target || labels.length === 0) return;
  gh(['issue', 'edit', targetNumber(target), '--add-label', labels.join(',')], { allowFailure: true });
}

function removeLabels(target, labels) {
  if (!target) return;
  for (const label of labels) {
    gh(['issue', 'edit', targetNumber(target), '--remove-label', label], { allowFailure: true });
  }
}

function addComment(targetNumberValue, body) {
  if (!targetNumberValue) return;
  gh(['issue', 'comment', String(targetNumberValue), '--body', body]);
}

function refreshLabel(target, label) {
  removeLabels(target, [label]);
  addLabels(target, [label]);
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

function dispatchClaude(issueNumber) {
  dispatchWorkflow('claude.yml', { issue_number: issueNumber });
}

function dispatchHumanReview({ targetType, targetNumber, reason }) {
  dispatchWorkflow('route-human-review.yml', {
    target_type: targetType,
    target_number: targetNumber,
    reason,
  });
}

function loadRun(runId) {
  const run = gh(
    ['run', 'view', String(runId), '--json', 'databaseId,name,url,conclusion,headBranch,headSha,jobs'],
    { parseJson: true }
  );
  return normalizeRunContext({ ...run, id: run.databaseId });
}

function parseWorkflowRunPullRequests(raw = '') {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findPr({ branch, pullRequests = [] }) {
  const number = pullRequests.find((item) => item?.number)?.number;
  if (number) {
    return gh(['pr', 'view', String(number), '--json', 'number,title,url,body,headRefName,isCrossRepository'], {
      parseJson: true,
      allowFailure: true,
    });
  }
  if (!branch) return null;
  const prs = gh(
    ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,title,url,body,headRefName,isCrossRepository'],
    { parseJson: true, allowFailure: true }
  );
  return Array.isArray(prs) ? prs[0] ?? null : null;
}

function loadComments(target) {
  if (!target) return [];
  const comments = gh(
    ['api', `repos/${process.env.GITHUB_REPOSITORY}/issues/${target}/comments`, '--paginate'],
    { parseJson: true, allowFailure: true }
  );
  return Array.isArray(comments) ? comments : [];
}

function loadFailedLog(runId) {
  return gh(['run', 'view', String(runId), '--log-failed'], { allowFailure: true });
}

async function executeRoutingPlan(plan) {
  if (plan.action === 'ignore') {
    console.log(`ci-failure-router: ${plan.reason}`);
    return;
  }

  const commentTarget = plan.pr?.number || plan.issueNumber;
  addComment(commentTarget, buildRepairComment(plan));

  const prTarget = plan.pr ? { type: 'pr', number: plan.pr.number } : null;
  const issueTarget = plan.issueNumber ? { type: 'issue', number: plan.issueNumber } : null;

  if (plan.action === 'human') {
    addLabels(prTarget, ['route-human']);
    addLabels(issueTarget, ['route-human']);
    removeLabels(issueTarget, [plan.agentLabel]);
    const humanTarget = prTarget || issueTarget;
    if (humanTarget) {
      dispatchHumanReview({
        targetType: humanTarget.type,
        targetNumber: humanTarget.number,
        reason: `CI self-heal stopped: ${plan.humanReason}`,
      });
    }
    console.log(`ci-failure-router: routed to human because ${plan.humanReason}`);
    return;
  }

  removeLabels(prTarget, ['route-human', 'ready-for-ernie']);
  removeLabels(issueTarget, ['route-human', 'ready-for-ernie']);
  if (plan.backoffSeconds > 0) {
    console.log(`ci-failure-router: waiting ${plan.backoffSeconds}s before refreshing ${plan.agentLabel}`);
    await sleep(plan.backoffSeconds);
  }
  refreshLabel(issueTarget, plan.agentLabel);
  dispatchClaude(plan.issueNumber);
  console.log(`ci-failure-router: refreshed ${plan.agentLabel} on issue #${plan.issueNumber}`);
}

async function main(env = process.env) {
  if (!env.GITHUB_REPOSITORY) throw new Error('GITHUB_REPOSITORY is required');
  const runId = env.WORKFLOW_RUN_ID || env.GITHUB_RUN_ID;
  if (!runId) throw new Error('WORKFLOW_RUN_ID is required');

  const run = loadRun(runId);
  const branch = run.headBranch || normalizeBranch(env.WORKFLOW_RUN_HEAD_BRANCH || '');
  const pr = findPr({
    branch,
    pullRequests: parseWorkflowRunPullRequests(env.WORKFLOW_RUN_PULL_REQUESTS || ''),
  });
  const issueFromBranch = parseAgentBranch(branch)?.issueNumber;
  const issueFromPr = extractIssueNumberFromPrBody(pr?.body || '');
  const comments = loadComments(pr?.number || issueFromBranch || issueFromPr);
  const log = loadFailedLog(runId);
  const plan = buildRoutingPlan({
    run,
    pr,
    comments,
    log,
    retryLimit: parseInteger(env.CI_FAILURE_RETRY_LIMIT, DEFAULT_RETRY_LIMIT),
    baseBackoffSeconds: parseInteger(env.CI_FAILURE_RETRY_BACKOFF_SECONDS, DEFAULT_BACKOFF_SECONDS),
    maxBackoffSeconds: parseInteger(env.CI_FAILURE_MAX_BACKOFF_SECONDS, DEFAULT_MAX_BACKOFF_SECONDS),
  });
  await executeRoutingPlan(plan);
}

if (process.argv[1]?.endsWith('ci-failure-router.mjs')) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}

export {
  ROUTER_MARKER_PREFIX,
  parseAgentBranch,
  extractIssueNumberFromPrBody,
  extractFailedJobs,
  extractFailureCommand,
  extractFailureExcerpt,
  redactSensitive,
  parseRouterMarker,
  getPriorRetryCount,
  calculateBackoffSeconds,
  buildRepairComment,
  buildRoutingPlan,
  dispatchWorkflow,
};
