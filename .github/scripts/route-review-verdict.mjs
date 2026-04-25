#!/usr/bin/env node
// Post-review router for the reviewer agent (issue #55).
//
// Invoked by .github/workflows/claude-review.yml after the reviewer agent runs.
// Prefer the action's structured output, post the PR comment ourselves, and
// route from that verdict. Fall back to parsing the latest bot VERDICT comment
// for older/manual runs.
//
//   APPROVE         → add `ready-for-ernie`, clear stale rerun/human labels, fire Discord ping.
//   REQUEST_CHANGES → refresh `claude-run` on the source issue, clear stale human/ready labels.
//   BLOCK           → send a human decision packet only when the reviewer supplied
//                     reason + options, and visual/product blocks include artifacts.
//
// No verdict found → refresh `claude-run` on the source issue when possible. Only
// route to human if automation cannot identify a source issue to continue from.
//
// This script is intentionally dependency-free Node (uses the GH_TOKEN via
// `gh` CLI + native fetch for Discord) so it runs without an npm install.

import { execFileSync } from 'node:child_process';

const PR_NUMBER = process.env.PR_NUMBER;
const PR_HEAD_REF = process.env.PR_HEAD_REF ?? '';
const REPO = process.env.GITHUB_REPOSITORY;
const REVIEWER_STRUCTURED_OUTPUT = process.env.REVIEWER_STRUCTURED_OUTPUT ?? '';
const HUMAN_CHOICE_PREFIX = 'human_choice';

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

// Path patterns that are always safe to auto-merge after reviewer APPROVE.
// Anything outside this list requires Ernie's explicit ack on Discord.
//
// Safelist intentionally narrow: only changes that cannot affect runtime
// product behavior (docs, tests, lockfile, generated convex types, GH
// configs that affect only automation, not the worker bundle).
const AUTO_MERGE_SAFELIST = [
  /^docs\//,
  /^tests\//,
  /^\.github\//,
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /\.test\.tsx?$/,
  /\.test\.mjs$/,
  /^package-lock\.json$/,
  /^convex\/_generated\//,
];

function listPrFiles(prNumber) {
  try {
    const out = gh(
      ['pr', 'view', String(prNumber), '--json', 'files', '-q', '.files[].path'],
      { parseJson: false }
    );
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function isPrSafeForAutoMerge(prNumber, labels) {
  // Fast path: explicit `auto-merge-safe` label always wins.
  if (labels?.some((l) => (l.name || l) === 'auto-merge-safe')) return true;
  // Otherwise: every changed file must match the safelist.
  const files = listPrFiles(prNumber);
  if (files.length === 0) return false;
  return files.every((p) =>
    AUTO_MERGE_SAFELIST.some((re) => re.test(p))
  );
}

function mergePr(prNumber, method = 'squash') {
  try {
    execFileSync(
      'gh',
      ['pr', 'merge', String(prNumber), `--${method}`],
      { encoding: 'utf8', stdio: 'inherit' }
    );
    return true;
  } catch (err) {
    console.warn(`Auto-merge of PR #${prNumber} failed: ${err.message ?? err}`);
    return false;
  }
}

// Pull a compact summary of acceptance / validation evidence from a reviewer
// comment so the Discord embed has more than just a link. Best-effort: any
// missing section is silently dropped.
function extractEvidenceFields(review, prBody) {
  const fields = [];
  const reviewBody = review?.body || '';

  // Acceptance bullets — common reviewer pattern: "### Acceptance items …"
  // followed by ✅/❌ list. We grab the first 6 lines.
  const acceptanceMatch = reviewBody.match(
    /###[^\n]*acceptance[^\n]*\n([\s\S]*?)(?:\n###|\n---|$)/i
  );
  if (acceptanceMatch) {
    const lines = acceptanceMatch[1]
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => /^[-*]\s|^\d+\./.test(s))
      .slice(0, 6);
    if (lines.length > 0) {
      fields.push({
        name: 'reviewer acceptance',
        value: truncateDiscord(lines.join('\n'), 800),
      });
    }
  }

  // Validation block from PR body — common author pattern: "## Validation"
  const valMatch = (prBody || '').match(
    /##[^\n]*validation[^\n]*\n([\s\S]*?)(?:\n##|$)/i
  );
  if (valMatch) {
    const lines = valMatch[1]
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (lines.length > 0) {
      fields.push({
        name: 'validation evidence',
        value: truncateDiscord(lines.join('\n'), 800),
      });
    }
  }

  return fields;
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
      humanReview: normalizeHumanReview(parsed.humanReview),
    };
  } catch (err) {
    console.warn(`could not parse reviewer structured output: ${err.message}`);
    return null;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function normalizeHumanOptions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        return { label: `Option ${index + 1}`, description: item.trim() };
      }
      if (!item || typeof item !== 'object') return null;
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      if (!label || !description) return null;
      return { label, description };
    })
    .filter(Boolean);
}

function normalizeHumanReview(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = ['visual', 'product', 'architecture', 'other'].includes(value.kind)
    ? value.kind
    : 'other';
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  const artifactUrls = normalizeStringArray(value.artifactUrls);
  const options = normalizeHumanOptions(value.options);
  return { kind, reason, artifactUrls, options };
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

function refreshLabel(target, label) {
  removeLabel(target, label);
  addLabels(target, [label]);
}

function addIssueComment(issueTarget, body) {
  gh(['issue', 'comment', String(issueTarget.number), '--body', body]);
  console.log(`posted handoff comment on issue #${issueTarget.number}`);
}

// Colors on Discord's dark theme.
const COLOR_APPROVE = 0x0e8a16;
const COLOR_BLOCK = 0xb60205;
const COLOR_ROUTE_HUMAN = 0xe88d67;

// Link buttons (style 5) + markdown-link fallback in content. On app-owned
// webhooks Discord renders the buttons; on non-app webhooks it ignores the
// `components` field and the content links remain clickable.
function buildPrActionRows(prUrl) {
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

function buildHumanChoiceRows(prUrl, prNumber, humanReview) {
  const rows = buildPrActionRows(prUrl) ?? [];
  const optionButtons = humanReview.options.slice(0, 4).map((_option, index) => ({
    type: 2,
    style: 1,
    label: `Choose ${index + 1}`,
    custom_id: `${HUMAN_CHOICE_PREFIX}_${prNumber}_${index + 1}`,
  }));
  if (optionButtons.length > 0) {
    rows.push({ type: 1, components: optionButtons });
  }
  return rows.length > 0 ? rows : undefined;
}

async function sendDiscordEmbed({ color, title, description, url, fields, components }) {
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
    components: components ?? buildPrActionRows(url),
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

function truncateDiscord(value, max = 1024) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function truncateGithub(value, max = 6000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 32)}\n\n[truncated by router]`;
}

function formatHumanOptions(options) {
  return options
    .map((option, index) => `**${index + 1}. ${option.label}** — ${option.description}`)
    .join('\n');
}

function formatHumanArtifacts(urls) {
  return urls.map((url, index) => `[artifact ${index + 1}](${url})`).join('\n');
}

function needsArtifactBackedChoice(humanReview) {
  return humanReview?.kind === 'visual' || humanReview?.kind === 'product';
}

function hasHumanDecisionPacket(review) {
  const humanReview = review?.humanReview;
  if (!humanReview?.reason || humanReview.options.length < 2) return false;
  if (needsArtifactBackedChoice(humanReview) && humanReview.artifactUrls.length === 0) {
    return false;
  }
  return true;
}

function buildHumanDecisionFields(commonFields, humanReview) {
  const fields = [...commonFields];
  fields.push({
    name: 'reason',
    value: truncateDiscord(humanReview.reason),
    inline: false,
  });
  fields.push({
    name: 'options',
    value: truncateDiscord(formatHumanOptions(humanReview.options)),
    inline: false,
  });
  if (humanReview.artifactUrls.length > 0) {
    fields.push({
      name: 'artifacts',
      value: truncateDiscord(formatHumanArtifacts(humanReview.artifactUrls)),
      inline: false,
    });
  }
  return fields;
}

function quoteMarkdown(value) {
  const trimmed = value.trim();
  if (!trimmed) return '> (no reviewer body captured)';
  return trimmed
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function buildRedispatchHandoff({ pr, verdict, reason, reviewBody }) {
  const lines = [
    '### Automated reviewer handoff',
    '',
    `PR: #${pr.number} ${pr.url}`,
    `Reviewer verdict: ${verdict ?? 'none'}`,
    `Repair instruction: ${reason}`,
    '',
    'The router is refreshing `claude-run` so the next agent can continue without a human relay.',
  ];

  if (reviewBody) {
    lines.push('', 'Reviewer context:', '', quoteMarkdown(truncateGithub(stripVerdictLines(reviewBody))));
  }

  return lines.join('\n');
}

function redispatchIssue(issueTarget, reason, handoffBody) {
  console.log(`${reason} — refreshing \`claude-run\` on issue #${issueTarget.number}`);
  if (handoffBody) addIssueComment(issueTarget, handoffBody);
  refreshLabel(issueTarget, 'claude-run');
}

async function routeUnrecoverableHuman({ prTarget, pr, commonFields, description }) {
  addLabels(prTarget, ['route-human']);
  await sendDiscordEmbed({
    color: COLOR_ROUTE_HUMAN,
    title: `aether · route-human · ${pr.title}`,
    description,
    url: pr.url,
    fields: commonFields,
  });
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
  let activeReview = reviewerComment
    ? { verdict, body: reviewerComment.body, humanReview: null }
    : null;

  if (structuredReview) {
    const body = formatReviewComment(structuredReview);
    gh(['pr', 'comment', PR_NUMBER, '--body', body]);
    console.log('posted reviewer comment from structured output');
    verdict = structuredReview.verdict;
    activeReview = structuredReview;
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
    removeLabel(prTarget, 'route-human');
    if (issueTarget) removeLabel(issueTarget, 'claude-run');

    // Pull evidence from the reviewer's body + PR body so the Discord embed
    // is self-contained — Ernie shouldn't have to open the PR to decide.
    const evidenceFields = extractEvidenceFields(activeReview, pr.body);

    // Auto-merge on the safelist (or explicit `auto-merge-safe` label).
    const safe = isPrSafeForAutoMerge(pr.number, pr.labels);
    if (safe) {
      const merged = mergePr(pr.number);
      if (merged) {
        await sendDiscordEmbed({
          color: COLOR_APPROVE,
          title: `aether · auto-merged · ${pr.title}`,
          description:
            'Reviewer APPROVED + paths within the auto-merge safelist (or `auto-merge-safe` label). Merged automatically — no action needed.',
          url: pr.url,
          fields: [...commonFields, ...evidenceFields],
        });
        return;
      }
      // Fall through to the manual-ack path if auto-merge failed.
      console.warn(`Auto-merge fell through for PR #${pr.number}; routing to Ernie.`);
    }

    addLabels(prTarget, ['ready-for-ernie']);
    await sendDiscordEmbed({
      color: COLOR_APPROVE,
      title: `aether · reviewer APPROVED · ${pr.title}`,
      description:
        'Reviewer agent passed. Click **Open PR** to merge on GitHub, or **Review diff** to eyeball the changes first. Acceptance + validation excerpts below if available.',
      url: pr.url,
      fields: [...commonFields, ...evidenceFields],
    });
    return;
  }

  if (verdict === 'REQUEST_CHANGES') {
    removeLabel(prTarget, 'route-human');
    removeLabel(prTarget, 'ready-for-ernie');
    if (issueTarget) {
      redispatchIssue(
        issueTarget,
        'Reviewer requested fixable changes; continue from the PR review context.',
        buildRedispatchHandoff({
          pr,
          verdict,
          reason: 'Reviewer requested fixable changes; update the PR and keep this in the automated loop.',
          reviewBody: activeReview?.body,
        })
      );
      console.log('REQUEST_CHANGES re-dispatched without Discord notification');
    } else {
      console.warn('REQUEST_CHANGES but no linked issue — routing to human because automation cannot continue.');
      await routeUnrecoverableHuman({
        prTarget,
        pr,
        commonFields,
        description:
          'Reviewer requested changes, but the router could not find a linked source issue to re-dispatch. Add a `Closes #N` issue link or dispatch the author agent manually.',
      });
    }
    return;
  }

  if (verdict === 'BLOCK') {
    if (!hasHumanDecisionPacket(activeReview)) {
      removeLabel(prTarget, 'route-human');
      removeLabel(prTarget, 'ready-for-ernie');
      if (issueTarget) {
        redispatchIssue(
          issueTarget,
          'BLOCK lacked a complete human decision packet; asking the agent loop to produce reason/options/artifacts',
          buildRedispatchHandoff({
            pr,
            verdict,
            reason:
              'Reviewer returned BLOCK without a complete human decision packet. Do not ping Ernie yet; either fix the issue or produce reason/options/artifacts for any true visual/product ambiguity.',
            reviewBody: activeReview?.body,
          })
        );
        console.log('BLOCK without decision packet re-dispatched without Discord notification');
      } else {
        console.warn('BLOCK lacked a human decision packet and no linked issue exists — routing to human.');
        await routeUnrecoverableHuman({
          prTarget,
          pr,
          commonFields,
          description:
            'Reviewer blocked the PR but did not provide a complete decision packet, and the router could not find a linked source issue to re-dispatch.',
        });
      }
      return;
    }

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
        'Reviewer needs a human decision. Pick an option using the linked artifacts/context; the selected choice will be posted back to the PR and the agent loop will continue.',
      url: pr.url,
      fields: buildHumanDecisionFields(commonFields, activeReview.humanReview),
      components: buildHumanChoiceRows(pr.url, pr.number, activeReview.humanReview),
    });
    return;
  }

  // No verdict: this is a harness/reviewer failure, not a product decision.
  console.warn('no parseable VERDICT in reviewer comment.');
  removeLabel(prTarget, 'ready-for-ernie');
  if (issueTarget) {
    removeLabel(prTarget, 'route-human');
    redispatchIssue(
      issueTarget,
      'No parseable reviewer verdict',
      buildRedispatchHandoff({
        pr,
        verdict: null,
        reason:
          'Reviewer did not produce a parseable verdict. Repair the review output or rerun review; do not involve Ernie unless a concrete product/visual decision packet is needed.',
        reviewBody: activeReview?.body,
      })
    );
    console.log('missing verdict re-dispatched without Discord notification');
    return;
  }

  await routeUnrecoverableHuman({
    prTarget,
    pr,
    commonFields,
    description:
      'Reviewer did not produce a parseable verdict, and the router could not find a linked source issue to re-dispatch. This needs harness triage.',
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
