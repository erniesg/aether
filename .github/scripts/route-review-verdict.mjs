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

  const reviewerComment = findLatestReviewerComment(comments);
  const verdict = reviewerComment ? parseVerdict(reviewerComment.body) : null;

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
    addLabels(prTarget, ['blocked']);
    if (issueTarget) addLabels(issueTarget, ['blocked']);
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
