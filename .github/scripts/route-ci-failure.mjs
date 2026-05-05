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

function gh(args, { quiet = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8' });
  } catch (err) {
    if (!quiet) console.warn(`gh ${args.join(' ')} failed: ${err.message}`);
    return '';
  }
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

  const eslintErrors = [];
  const eslintRe = /^(\S+\.tsx?):(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+\/\S+)$/gm;
  while ((m = eslintRe.exec(log)) !== null && eslintErrors.length < 8) {
    eslintErrors.push({ file: m[1], line: Number(m[2]), col: Number(m[3]), severity: m[4], msg: m[5], rule: m[6] });
  }

  return {
    typecheck: tsErrors,
    tests: vitestFails,
    lint: eslintErrors,
    totalSignals: tsErrors.length + vitestFails.length + eslintErrors.length,
  };
}

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
    for (const e of summary.typecheck.slice(0, 8)) {
      lines.push(`- \`${e.file}:${e.line}:${e.col}\` ${e.code} — ${e.msg}`);
    }
    if (summary.typecheck.length > 8) {
      lines.push(`- … ${summary.typecheck.length - 8} more`);
    }
    lines.push('');
  }
  if (summary.tests.length > 0) {
    lines.push('**Failing tests**:');
    for (const t of summary.tests.slice(0, 8)) {
      lines.push(`- \`${t.file}\` › ${t.suite} › ${t.test}`);
    }
    if (summary.tests.length > 8) {
      lines.push(`- … ${summary.tests.length - 8} more`);
    }
    lines.push('');
  }
  if (summary.lint.length > 0) {
    lines.push('**Lint**:');
    for (const l of summary.lint.slice(0, 8)) {
      lines.push(`- \`${l.file}:${l.line}\` ${l.rule}: ${l.msg}`);
    }
    lines.push('');
  }
  lines.push(`[Full log](${runUrl})`);
  return lines.join('\n');
}

function countPriorAttempts(issueNumber) {
  if (!issueNumber) return 0;
  const raw = gh(['issue', 'view', String(issueNumber), '--json', 'comments', '-q', '.comments[].body']);
  if (!raw) return 0;
  const matches = raw.match(/<!--\s*ci-failure-attempt:\d+\s*-->/g) ?? [];
  return matches.length;
}

function postIssueComment(issueNumber, attemptNumber, packet) {
  const marker = `${ATTEMPT_MARKER_PREFIX}${attemptNumber} -->`;
  const body = `${marker}\n\n${packet}`;
  // Stream via stdin to avoid arg-length limits.
  execFileSync('gh', ['issue', 'comment', String(issueNumber), '--body-file', '-'], {
    input: body,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

function postPrComment(prNumber, packet) {
  execFileSync('gh', ['pr', 'comment', String(prNumber), '--body-file', '-'], {
    input: packet,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

function refreshClaudeRun(issueNumber) {
  if (!issueNumber) return false;
  // Remove + re-add the label to fire claude.yml fresh.
  gh(['issue', 'edit', String(issueNumber), '--remove-label', 'claude-run'], { quiet: true });
  gh(['issue', 'edit', String(issueNumber), '--add-label', 'claude-run']);
  return true;
}

function escalateToHuman(issueNumber, prNumber, attemptNumber) {
  if (issueNumber) {
    gh(['issue', 'edit', String(issueNumber),
        '--remove-label', 'claude-run',
        '--add-label', 'needs-human-review']);
  }
  const escMsg = `❌ CI failed ${attemptNumber} times in a row. Stopping the auto-fix loop and asking Ernie. PR #${prNumber}.`;
  if (issueNumber) postIssueComment(issueNumber, attemptNumber, escMsg);
  if (DISCORD_WEBHOOK) {
    notifyDiscord({
      title: `CI auto-fix budget exhausted on PR #${prNumber}`,
      body: escMsg,
      url: `https://github.com/${REPO}/pull/${prNumber}`,
    });
  }
}

function notifyDiscord({ title, body, url }) {
  if (!DISCORD_WEBHOOK) return;
  const payload = JSON.stringify({
    content: title,
    embeds: [{ title, description: body, url }],
  });
  // Native fetch is fine; this is Node 20+.
  fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  }).catch((err) => console.warn(`discord notify failed: ${err.message}`));
}

// ────── exports for unit tests ──────

export {
  summarizeFailure,
  formatPacket,
  ATTEMPT_MARKER_PREFIX,
  ATTEMPT_MARKER_RE,
};

// ────── main ──────

function main() {
  validateEnvForRun();
  const log = readLog();
  const summary = summarizeFailure(log);
  const runUrl = `https://github.com/${REPO}/actions/runs/${RUN_ID}`;
  const packet = formatPacket({ summary, log, runUrl });

  const priorAttempts = countPriorAttempts(ISSUE_NUMBER);
  const attemptNumber = priorAttempts + 1;

  console.log(`CI failure router: attempt ${attemptNumber} (max ${MAX_RETRIES})`);
  console.log(`Branch: ${BRANCH}, PR: #${PR_NUMBER}, Issue: #${ISSUE_NUMBER || 'unknown'}`);
  console.log(`Signals: typecheck=${summary.typecheck.length}, tests=${summary.tests.length}, lint=${summary.lint.length}`);

  postPrComment(PR_NUMBER, packet);
  if (ISSUE_NUMBER) {
    postIssueComment(ISSUE_NUMBER, attemptNumber, packet);
  }

  if (attemptNumber > MAX_RETRIES) {
    console.log(`Retry budget exhausted (attempt ${attemptNumber} > ${MAX_RETRIES}); escalating.`);
    escalateToHuman(ISSUE_NUMBER, PR_NUMBER, attemptNumber);
    return;
  }

  if (refreshClaudeRun(ISSUE_NUMBER)) {
    console.log(`Re-fired claude-run on issue #${ISSUE_NUMBER}.`);
  } else {
    console.log('No issue number resolved; cannot re-fire agent.');
  }
}

// Run main() only when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
