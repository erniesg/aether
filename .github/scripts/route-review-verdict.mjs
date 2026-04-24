#!/usr/bin/env node
// Post-review router for the reviewer agent (issue #55).
//
// Invoked by .github/workflows-proposed/claude-review.yml after the reviewer
// agent posts its PR comment. Reads the latest claude[bot] comment, parses
// the VERDICT line, and routes:
//
//   APPROVE         → add `ready-for-ernie` label to PR, fire Discord ping.
//   REQUEST_CHANGES → re-add `claude-run` label to the source issue.
//   BLOCK           → add `blocked` label to PR + source issue; no more automation.
//
// No verdict found → add `route-human` label so Ernie notices. Fail closed.
//
// This script is intentionally dependency-free Node (uses the GH_TOKEN via
// `gh` CLI + native fetch for Discord) so it runs without an npm install.

import { execFileSync } from 'node:child_process';

const PR_NUMBER = process.env.PR_NUMBER;
const PR_HEAD_REF = process.env.PR_HEAD_REF ?? '';

if (!PR_NUMBER) {
  console.error('PR_NUMBER env var is required');
  process.exit(1);
}

function gh(args, { parseJson = false } = {}) {
  const out = execFileSync('gh', args, { encoding: 'utf8' });
  return parseJson ? JSON.parse(out) : out;
}

// Mirror of lib/review/parseVerdict.ts — kept inline so the workflow shell
// step doesn't need a compile/install. If the regex ever drifts, the unit
// test in tests/unit/review-parseVerdict.test.ts is the source of truth.
const VERDICT_LINE = /VERDICT:\s*(APPROVE|REQUEST_CHANGES|BLOCK)\b/g;
function parseVerdict(body) {
  if (!body) return null;
  let last = null;
  let m;
  VERDICT_LINE.lastIndex = 0;
  while ((m = VERDICT_LINE.exec(body)) !== null) {
    last = m[1];
  }
  return last;
}

function extractIssueNumberFromBranch(ref) {
  // claude/issue-<n>-<slug>
  const m = /^claude\/issue-(\d+)(?:-|$)/.exec(ref);
  return m ? Number(m[1]) : null;
}

function extractIssueNumberFromPrBody(body) {
  if (!body) return null;
  const m = /(?:closes|fixes|resolves)\s+#(\d+)/i.exec(body);
  return m ? Number(m[1]) : null;
}

function findLatestReviewerComment(comments) {
  // The reviewer agent posts as claude[bot]. We want the latest such comment
  // that actually contains a VERDICT line — earlier status updates from the
  // same bot (e.g. "working on it…") should be skipped.
  const reviewerComments = comments
    .filter((c) => c.user?.login === 'claude[bot]' || c.user?.login?.endsWith('[bot]'))
    .filter((c) => parseVerdict(c.body) !== null);
  if (reviewerComments.length === 0) return null;
  reviewerComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return reviewerComments[0];
}

function addLabels(target, labels) {
  // target: { type: 'pr' | 'issue', number }
  const kind = target.type === 'pr' ? 'pr' : 'issue';
  for (const label of labels) {
    try {
      gh([kind, 'edit', String(target.number), '--add-label', label]);
      console.log(`added label \`${label}\` to ${kind} #${target.number}`);
    } catch (err) {
      console.error(`failed to add label ${label} to ${kind} #${target.number}: ${err.message}`);
    }
  }
}

function removeLabel(target, label) {
  const kind = target.type === 'pr' ? 'pr' : 'issue';
  try {
    gh([kind, 'edit', String(target.number), '--remove-label', label]);
    console.log(`removed label \`${label}\` from ${kind} #${target.number}`);
  } catch (err) {
    // Label may not have been present; non-fatal.
    console.warn(`could not remove label ${label} from ${kind} #${target.number}: ${err.message}`);
  }
}

async function sendDiscord(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${res.statusText}`);
    return;
  }
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (botToken && channelId) {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) throw new Error(`Discord bot POST failed: ${res.status} ${res.statusText}`);
    return;
  }
  throw new Error(
    'No Discord delivery configured — set DISCORD_WEBHOOK_URL or DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID. ' +
      'Fail closed so APPROVE verdicts never silently drop.'
  );
}

async function main() {
  const pr = gh(
    ['pr', 'view', PR_NUMBER, '--json', 'number,title,url,body,headRefName,author'],
    { parseJson: true }
  );

  const comments = gh(
    ['api', `repos/${process.env.GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`, '--paginate'],
    { parseJson: true }
  );

  const reviewerComment = findLatestReviewerComment(comments);
  const verdict = reviewerComment ? parseVerdict(reviewerComment.body) : null;

  const issueNumber =
    extractIssueNumberFromBranch(PR_HEAD_REF || pr.headRefName) ??
    extractIssueNumberFromPrBody(pr.body);

  console.log(`PR #${pr.number} · branch ${pr.headRefName} · linked issue #${issueNumber ?? '?'}`);
  console.log(`verdict: ${verdict ?? '(none found)'}`);

  const prTarget = { type: 'pr', number: pr.number };
  const issueTarget = issueNumber ? { type: 'issue', number: issueNumber } : null;

  if (verdict === 'APPROVE') {
    addLabels(prTarget, ['ready-for-ernie']);
    const msg = `aether · reviewer APPROVED\nPR #${pr.number} · ${pr.title}\n${pr.url}`;
    await sendDiscord(msg);
    return;
  }

  if (verdict === 'REQUEST_CHANGES') {
    if (issueTarget) {
      addLabels(issueTarget, ['claude-run']);
    } else {
      console.warn('REQUEST_CHANGES but no linked issue — add `route-human` to PR instead.');
      addLabels(prTarget, ['route-human']);
    }
    return;
  }

  if (verdict === 'BLOCK') {
    addLabels(prTarget, ['blocked']);
    if (issueTarget) addLabels(issueTarget, ['blocked']);
    return;
  }

  // No verdict: fail-closed route to human review.
  console.warn('no parseable VERDICT in reviewer comment — routing to human.');
  addLabels(prTarget, ['route-human']);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
