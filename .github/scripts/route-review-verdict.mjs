#!/usr/bin/env node
// Post-review router for the reviewer agent (issue #55).
//
// Invoked by .github/workflows/claude-review.yml after the reviewer agent runs.
// Prefer the action's structured output, post the PR comment ourselves, and
// route from that verdict. Fall back to parsing the latest bot VERDICT comment
// for older/manual runs.
//
//   APPROVE         → add `ready-for-ernie`, clear stale rerun/human labels, fire Discord ping.
//   REQUEST_CHANGES → re-add `claude-run` to the source issue, clear stale human/ready labels.
//   BLOCK           → add `blocked` to PR + source issue, clear stale automation labels.
//
// No verdict found → add `route-human` label so Ernie notices. Fail closed.
//
// This script is intentionally dependency-free Node (uses the GH_TOKEN via
// `gh` CLI + native fetch for Discord) so it runs without an npm install.

import { execFileSync } from 'node:child_process';

const PR_NUMBER = process.env.PR_NUMBER;
const PR_HEAD_REF = process.env.PR_HEAD_REF ?? '';
const REPO = process.env.GITHUB_REPOSITORY;
const REVIEWER_STRUCTURED_OUTPUT = process.env.REVIEWER_STRUCTURED_OUTPUT ?? '';

if (!PR_NUMBER) {
  console.error('PR_NUMBER env var is required');
  process.exit(1);
}

if (!REPO) {
  console.error('GITHUB_REPOSITORY env var is required');
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

const REVIEW_VERDICTS = new Set(['APPROVE', 'REQUEST_CHANGES', 'BLOCK']);

function parseStructuredReview(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    const verdict = parsed?.verdict;
    if (!REVIEW_VERDICTS.has(verdict)) {
      console.warn(`structured output had invalid verdict: ${String(verdict)}`);
      return null;
    }
    return {
      verdict,
      body: typeof parsed.body === 'string' ? parsed.body : '',
    };
  } catch (err) {
    console.warn(`could not parse reviewer structured output: ${err.message}`);
    return null;
  }
}

function stripVerdictLines(body) {
  return (body ?? '')
    .split('\n')
    .filter((line) => parseVerdict(line) === null)
    .join('\n')
    .trim();
}

function formatReviewComment(review) {
  const body = stripVerdictLines(review.body);
  const summary =
    body ||
    'Reviewer agent returned a structured verdict without a written summary.';
  return `${summary}\n\nVERDICT: ${review.verdict}`;
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
  // Pull requests use the Issues labels REST API too. Avoid `gh pr edit`
  // here; it currently touches deprecated Projects classic GraphQL fields.
  for (const label of labels) {
    try {
      gh([
        'api',
        `repos/${REPO}/issues/${target.number}/labels`,
        '-X',
        'POST',
        '-f',
        `labels[]=${label}`,
      ]);
      console.log(`added label \`${label}\` to ${target.type} #${target.number}`);
    } catch (err) {
      console.error(`failed to add label ${label} to ${target.type} #${target.number}: ${err.message}`);
    }
  }
}

function removeLabel(target, label) {
  try {
    gh([
      'api',
      `repos/${REPO}/issues/${target.number}/labels/${encodeURIComponent(label)}`,
      '-X',
      'DELETE',
      '--silent',
    ]);
    console.log(`removed label \`${label}\` from ${target.type} #${target.number}`);
  } catch (err) {
    // Label may not have been present; non-fatal.
    console.warn(`could not remove label ${label} from ${target.type} #${target.number}: ${err.message}`);
  }
}

// Colors on Discord's dark theme.
const COLOR_APPROVE = 0x0e8a16;
const COLOR_REQUEST = 0xfbca04;
const COLOR_BLOCK = 0xb60205;
const COLOR_ROUTE_HUMAN = 0xe88d67;

// Link buttons (style 5) + markdown-link fallback in content. On app-owned
// webhooks Discord renders the buttons; on non-app webhooks it ignores the
// `components` field and the content links remain clickable.
function buildPrActionRow(prUrl) {
  if (!prUrl) return undefined;
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: 'Open PR', url: prUrl },
        { type: 2, style: 5, label: 'Review diff', url: `${prUrl}/files` },
        { type: 2, style: 5, label: 'Comment', url: `${prUrl}#issuecomment-new` },
      ],
    },
  ];
}

async function sendDiscordEmbed({ color, title, description, url, fields }) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;

  if (!webhookUrl && !(botToken && channelId)) {
    throw new Error(
      'No Discord delivery configured — set DISCORD_WEBHOOK_URL or DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID. ' +
        'Fail closed so verdicts never silently drop.'
    );
  }

  const embed = { color, title, description, timestamp: new Date().toISOString() };
  if (url) embed.url = url;
  if (fields && fields.length > 0) embed.fields = fields;

  const body = {
    content: url,
    embeds: [embed],
    components: buildPrActionRow(url),
    allowed_mentions: { parse: [] },
  };

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Discord webhook failed: ${res.status} ${text}`);
    }
    return;
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord bot POST failed: ${res.status} ${text}`);
  }
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

  const structuredReview = parseStructuredReview(REVIEWER_STRUCTURED_OUTPUT);
  const reviewerComment = findLatestReviewerComment(comments);
  let verdict = reviewerComment ? parseVerdict(reviewerComment.body) : null;

  if (structuredReview) {
    const body = formatReviewComment(structuredReview);
    gh(['pr', 'comment', PR_NUMBER, '--body', body]);
    console.log('posted reviewer comment from structured output');
    verdict = structuredReview.verdict;
  }

  const issueNumber =
    extractIssueNumberFromBranch(PR_HEAD_REF || pr.headRefName) ??
    extractIssueNumberFromPrBody(pr.body);

  console.log(`PR #${pr.number} · branch ${pr.headRefName} · linked issue #${issueNumber ?? '?'}`);
  console.log(`verdict: ${verdict ?? '(none found)'}`);

  const prTarget = { type: 'pr', number: pr.number };
  const issueTarget = issueNumber ? { type: 'issue', number: issueNumber } : null;

  const commonFields = [
    { name: 'branch', value: `\`${pr.headRefName}\``, inline: true },
    { name: 'PR', value: `[#${pr.number}](${pr.url})`, inline: true },
  ];
  if (issueNumber) {
    commonFields.push({
      name: 'issue',
      value: `[#${issueNumber}](https://github.com/${process.env.GITHUB_REPOSITORY}/issues/${issueNumber})`,
      inline: true,
    });
  }

  if (verdict === 'APPROVE') {
    addLabels(prTarget, ['ready-for-ernie']);
    removeLabel(prTarget, 'route-human');
    if (issueTarget) removeLabel(issueTarget, 'claude-run');
    await sendDiscordEmbed({
      color: COLOR_APPROVE,
      title: `aether · reviewer APPROVED · ${pr.title}`,
      description:
        'Reviewer agent passed. Click **Open PR** to merge on GitHub, or **Review diff** to eyeball the changes first.',
      url: pr.url,
      fields: commonFields,
    });
    return;
  }

  if (verdict === 'REQUEST_CHANGES') {
    removeLabel(prTarget, 'route-human');
    removeLabel(prTarget, 'ready-for-ernie');
    if (issueTarget) {
      addLabels(issueTarget, ['claude-run']);
    } else {
      console.warn('REQUEST_CHANGES but no linked issue — add `route-human` to PR instead.');
      addLabels(prTarget, ['route-human']);
    }
    // Ping so Ernie knows changes are being iterated on.
    await sendDiscordEmbed({
      color: COLOR_REQUEST,
      title: `aether · reviewer REQUESTED_CHANGES · ${pr.title}`,
      description:
        'Reviewer flagged issues. Author agent has been re-dispatched. No action needed unless the loop stalls.',
      url: pr.url,
      fields: commonFields,
    });
    return;
  }

  if (verdict === 'BLOCK') {
    removeLabel(prTarget, 'route-human');
    removeLabel(prTarget, 'ready-for-ernie');
    addLabels(prTarget, ['blocked']);
    if (issueTarget) {
      removeLabel(issueTarget, 'claude-run');
      addLabels(issueTarget, ['blocked']);
    }
    await sendDiscordEmbed({
      color: COLOR_BLOCK,
      title: `aether · reviewer BLOCKED · ${pr.title}`,
      description:
        'Reviewer rejected architectural/scope reasons. Human resolution required.',
      url: pr.url,
      fields: commonFields,
    });
    return;
  }

  // No verdict: fail-closed route to human review.
  console.warn('no parseable VERDICT in reviewer comment — routing to human.');
  addLabels(prTarget, ['route-human']);
  await sendDiscordEmbed({
    color: COLOR_ROUTE_HUMAN,
    title: `aether · route-human · ${pr.title}`,
    description:
      'Reviewer agent did not produce a parseable VERDICT. Manual review required.',
    url: pr.url,
    fields: commonFields,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
