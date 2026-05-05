#!/usr/bin/env node
// Router for ci.yml failures on agent branches.
//
// Invoked by .github/workflows/ci-failure-router.yml. Reads the captured
// failure log path from argv[2], extracts a compact "what broke" summary,
// posts it to the linked PR + issue, increments the retry counter, and
// either re-fires the author agent (claude-run) or escalates to Ernie via
// Discord when the retry budget is exhausted.
//
// Retry counter convention: the router posts an issue comment that begins
// with `<!-- ci-failure-attempt:N -->`. To count attempts, we list issue
// comments and grep for that prefix. Idempotent: a duplicate dispatch
// produces a duplicate comment, which is OK — the next read still gets
// the right N.
//
// Like route-review-verdict.mjs, this script is dependency-free Node so it
// runs without npm install in the workflow.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const LOG_PATH = process.argv[2];
const PR_NUMBER = process.env.PR_NUMBER;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER || '';
const BRANCH = process.env.BRANCH || '';
const RUN_ID = process.env.RUN_ID || '';
const REPO = process.env.GITHUB_REPOSITORY || process.env.REPO || '';
const MAX_RETRIES = Number(process.env.MAX_RETRIES || '2');
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK || '';

const ATTEMPT_MARKER_PREFIX = '<!-- ci-failure-attempt:';
const ATTEMPT_MARKER_RE = /<!--\s*ci-failure-attempt:(\d+)\s*-->/;

// Env validation — only enforced when invoked as a script, not on import.
function validateEnvForRun() {
  if (!PR_NUMBER) {
    console.error('PR_NUMBER required');
    process.exit(1);
  }
  if (!REPO) {
    console.error('GITHUB_REPOSITORY required');
    process.exit(1);
  }
}

// Default gh implementation: spawn the real CLI. Tests swap this out via
// `__setGhImpl` so behavioral tests can drive the orchestration without
// hitting GitHub.
let _ghImpl = function defaultGhImpl(args) {
  try {
    return { ok: true, stdout: execFileSync('gh', args, { encoding: 'utf8' }) };
  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
    return { ok: false, stdout: '', error: message };
  }
};

// Stdin-streamed gh exec — used only by post*Comment. Same swap-for-tests
// shape as _ghImpl.
let _ghStdinImpl = function defaultGhStdinImpl(args, input) {
  execFileSync('gh', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
};

// Three-state return so callers can distinguish "no output" (success with
// nothing to report) from "gh failed" (transient API hiccup, rate limit,
// missing perms). Conflating the two is what made `countPriorAttempts`
// liable to a silent infinite-retry loop.
function ghCall(args, { quiet = false } = {}) {
  const result = _ghImpl(args);
  if (!result.ok && !quiet) {
    console.warn(`gh ${args.join(' ')} failed: ${result.error}`);
  }
  return result;
}

// Back-compat shim for call sites that don't care about errors. New code
// should call ghCall directly so it can branch on the failure case.
function gh(args, opts) {
  return ghCall(args, opts).stdout;
}

function readLog() {
  if (!LOG_PATH || !existsSync(LOG_PATH)) return '(log unavailable)';
  const raw = readFileSync(LOG_PATH, 'utf8').trim();
  return raw || '(log empty)';
}

// Compact the log into a structured summary the agent can act on. We extract
// TypeScript errors, vitest FAIL lines, and the first ESLint-shaped error.
// Anything else falls back to "raw tail" so we don't lie about what we saw.
function summarizeFailure(log) {
  const tsErrors = [];
  const tsRe = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  let m;
  while ((m = tsRe.exec(log)) !== null) {
    tsErrors.push({ file: m[1], line: Number(m[2]), col: Number(m[3]), code: m[4], msg: m[5] });
  }

  const vitestFails = [];
  const vitestRe = /^\s*FAIL\s+(.+?)\s*>\s*(.+?)\s*>\s*(.+?)$/gm;
  while ((m = vitestRe.exec(log)) !== null) {
    vitestFails.push({ file: m[1], suite: m[2], test: m[3] });
  }

  // Don't truncate during extraction — let the formatter slice + emit the
  // "… N more" indicator, same as typecheck and tests. Otherwise a refactor
  // that produces 30 lint errors silently shows the agent only 8 with no
  // signal that there are more.
  const eslintErrors = [];
  const eslintRe = /^(\S+\.tsx?):(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+\/\S+)$/gm;
  while ((m = eslintRe.exec(log)) !== null) {
    eslintErrors.push({ file: m[1], line: Number(m[2]), col: Number(m[3]), severity: m[4], msg: m[5], rule: m[6] });
  }

  return {
    typecheck: tsErrors,
    tests: vitestFails,
    lint: eslintErrors,
    totalSignals: tsErrors.length + vitestFails.length + eslintErrors.length,
  };
}

// Per-section truncation cap. 8 keeps the packet compact enough to fit
// inside the agent's context budget without a separate fetch, while
// surfacing enough signal that the agent knows the shape of the failure.
// Bump this if the agent starts asking for the full log on common
// multi-failure refactors.
const SECTION_LIMIT = 8;

function formatPacket({ summary, log, runUrl }) {
  const lines = ['### CI failure packet', ''];
  if (summary.totalSignals === 0) {
    lines.push('No structured failures matched. Last 200 lines of the failure log:');
    lines.push('', '```', log.slice(-3500), '```');
    lines.push('', `[Full log](${runUrl})`);
    return lines.join('\n');
  }
  if (summary.typecheck.length > 0) {
    lines.push('**Typecheck**:');
    for (const e of summary.typecheck.slice(0, SECTION_LIMIT)) {
      lines.push(`- \`${e.file}:${e.line}:${e.col}\` ${e.code} — ${e.msg}`);
    }
    if (summary.typecheck.length > SECTION_LIMIT) {
      lines.push(`- … ${summary.typecheck.length - SECTION_LIMIT} more`);
    }
    lines.push('');
  }
  if (summary.tests.length > 0) {
    lines.push('**Failing tests**:');
    for (const t of summary.tests.slice(0, SECTION_LIMIT)) {
      lines.push(`- \`${t.file}\` › ${t.suite} › ${t.test}`);
    }
    if (summary.tests.length > SECTION_LIMIT) {
      lines.push(`- … ${summary.tests.length - SECTION_LIMIT} more`);
    }
    lines.push('');
  }
  if (summary.lint.length > 0) {
    lines.push('**Lint**:');
    for (const l of summary.lint.slice(0, SECTION_LIMIT)) {
      lines.push(`- \`${l.file}:${l.line}\` ${l.rule}: ${l.msg}`);
    }
    if (summary.lint.length > SECTION_LIMIT) {
      lines.push(`- … ${summary.lint.length - SECTION_LIMIT} more`);
    }
    lines.push('');
  }
  lines.push(`[Full log](${runUrl})`);
  return lines.join('\n');
}

// Returns:
//   { ok: true,  count: N }   normal path; N may be 0 if no markers found
//   { ok: false, error }      gh failed; caller MUST treat this as fatal
//                             so we don't reset the retry counter and burn
//                             through the budget without ever escalating.
function countPriorAttempts(issueNumber) {
  if (!issueNumber) return { ok: true, count: 0 };
  const result = ghCall([
    'issue', 'view', String(issueNumber),
    '--json', 'comments', '-q', '.comments[].body',
  ]);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  const matches = result.stdout.match(/<!--\s*ci-failure-attempt:\d+\s*-->/g) ?? [];
  return { ok: true, count: matches.length };
}

function postIssueComment(issueNumber, attemptNumber, packet) {
  const marker = `${ATTEMPT_MARKER_PREFIX}${attemptNumber} -->`;
  const body = `${marker}\n\n${packet}`;
  _ghStdinImpl(['issue', 'comment', String(issueNumber), '--body-file', '-'], body);
}

function postPrComment(prNumber, packet) {
  _ghStdinImpl(['pr', 'comment', String(prNumber), '--body-file', '-'], packet);
}

// Branch-aware label refresh. `claude/issue-*` heads re-fire `claude-run`;
// `codex/issue-*` heads re-fire `codex-run`. Mismatched branches default
// to `claude-run` for back-compat (the original v1 behavior).
function pickAgentLabel(branch) {
  if (typeof branch === 'string' && branch.startsWith('codex/issue-')) {
    return 'codex-run';
  }
  return 'claude-run';
}

function refreshClaudeRun(issueNumber, branch) {
  if (!issueNumber) return false;
  const label = pickAgentLabel(branch);
  gh(['issue', 'edit', String(issueNumber), '--remove-label', label], { quiet: true });
  gh(['issue', 'edit', String(issueNumber), '--add-label', label]);
  return true;
}

async function escalateToHuman(issueNumber, prNumber, attemptNumber, repo, discordWebhook, branch) {
  if (issueNumber) {
    const agentLabel = pickAgentLabel(branch);
    gh(['issue', 'edit', String(issueNumber),
        '--remove-label', agentLabel,
        '--add-label', 'needs-human-review']);
  }
  const escMsg = `[escalation] CI failed ${attemptNumber} times in a row. Stopping the auto-fix loop and asking Ernie. PR #${prNumber}.`;
  if (issueNumber) postIssueComment(issueNumber, attemptNumber, escMsg);
  if (discordWebhook) {
    // Awaited so the workflow runner doesn't exit while the POST is in
    // flight. Previously fire-and-forget could drop the escalation
    // notification — exactly the case where Ernie needs to be paged.
    await notifyDiscord({
      title: `CI auto-fix budget exhausted on PR #${prNumber}`,
      body: escMsg,
      url: `https://github.com/${repo}/pull/${prNumber}`,
      webhookUrl: discordWebhook,
    });
  }
}

async function notifyDiscord({ title, body, url, webhookUrl }) {
  if (!webhookUrl) return;
  const payload = JSON.stringify({
    content: title,
    embeds: [{ title, description: body, url }],
  });
  // Awaited so the workflow runner finishes the POST before main() exits.
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
  } catch (err) {
    console.warn(`discord notify failed: ${err && err.message ? err.message : err}`);
  }
}

// ────── exports for unit tests ──────

// Test seam: swap the gh implementations so behavioral tests can drive
// `runOrchestration` without spawning the real CLI. Pass `null` to reset
// to the default. Both seams share a fluent API:
//   __setGhImpl((args) => ({ ok: true, stdout: '...' }))
//   __setGhStdinImpl((args, input) => { /* record */ })
function __setGhImpl(fn) {
  _ghImpl = typeof fn === 'function' ? fn : defaultGhImpl();
}
function __setGhStdinImpl(fn) {
  _ghStdinImpl = typeof fn === 'function' ? fn : defaultGhStdinImpl();
}
function defaultGhImpl() {
  return function realGhImpl(args) {
    try {
      return { ok: true, stdout: execFileSync('gh', args, { encoding: 'utf8' }) };
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
      return { ok: false, stdout: '', error: message };
    }
  };
}
function defaultGhStdinImpl() {
  return function realGhStdinImpl(args, input) {
    execFileSync('gh', args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  };
}

// runOrchestration is the pure-ish entry point: given env + log path, do the
// retry-budget gate + side effects. It returns a record of what it did so
// behavioral tests can assert against the decision tree without scraping
// stdout. Side effects (`gh`, fetch) go through the swappable impls above.
async function runOrchestration({
  logPath,
  prNumber,
  issueNumber,
  branch,
  runId,
  repo,
  maxRetries,
  discordWebhook,
}) {
  const log = (() => {
    if (!logPath || !existsSync(logPath)) return '(log unavailable)';
    const raw = readFileSync(logPath, 'utf8').trim();
    return raw || '(log empty)';
  })();
  const summary = summarizeFailure(log);
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
  const packet = formatPacket({ summary, log, runUrl });

  const counted = countPriorAttempts(issueNumber);
  if (!counted.ok) {
    return {
      action: 'aborted',
      reason: 'gh-call-failed',
      error: counted.error,
      packet,
      summary,
    };
  }
  const attemptNumber = counted.count + 1;

  postPrComment(prNumber, packet);
  if (issueNumber) postIssueComment(issueNumber, attemptNumber, packet);

  if (attemptNumber > maxRetries) {
    await escalateToHuman(issueNumber, prNumber, attemptNumber, repo, discordWebhook, branch);
    return {
      action: 'escalated',
      attemptNumber,
      packet,
      summary,
    };
  }

  const refired = refreshClaudeRun(issueNumber, branch);
  return {
    action: refired ? 're-fired' : 'no-issue-no-refire',
    attemptNumber,
    packet,
    summary,
  };
}

export {
  summarizeFailure,
  formatPacket,
  countPriorAttempts,
  refreshClaudeRun,
  runOrchestration,
  ATTEMPT_MARKER_PREFIX,
  ATTEMPT_MARKER_RE,
  SECTION_LIMIT,
  __setGhImpl,
  __setGhStdinImpl,
};

// ────── main ──────

async function main() {
  validateEnvForRun();
  const result = await runOrchestration({
    logPath: LOG_PATH,
    prNumber: PR_NUMBER,
    issueNumber: ISSUE_NUMBER,
    branch: BRANCH,
    runId: RUN_ID,
    repo: REPO,
    maxRetries: MAX_RETRIES,
    discordWebhook: DISCORD_WEBHOOK,
  });

  console.log(`Branch: ${BRANCH}, PR: #${PR_NUMBER}, Issue: #${ISSUE_NUMBER || 'unknown'}`);
  console.log(
    `Signals: typecheck=${result.summary.typecheck.length}, tests=${result.summary.tests.length}, lint=${result.summary.lint.length}`
  );

  switch (result.action) {
    case 'aborted':
      console.error(`Could not read prior CI-failure attempts (gh error): ${result.error}`);
      console.error('Refusing to retry — would risk an unbounded loop. Investigate the gh CLI failure.');
      process.exit(1);
      return;
    case 'escalated':
      console.log(`Retry budget exhausted (attempt ${result.attemptNumber} > ${MAX_RETRIES}); escalated.`);
      return;
    case 're-fired':
      console.log(`Attempt ${result.attemptNumber}/${MAX_RETRIES}: re-fired claude-run on issue #${ISSUE_NUMBER}.`);
      return;
    case 'no-issue-no-refire':
      console.log(`Attempt ${result.attemptNumber}/${MAX_RETRIES}: no issue number resolved; cannot re-fire agent.`);
      return;
    default:
      console.warn(`Unknown orchestration action: ${result.action}`);
  }
}

// Run main() only when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`router crashed: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}
