import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return {};
  return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
}

function gh(args, { parseJson = false } = {}) {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  return parseJson ? JSON.parse(out) : out.trim();
}

function loadManualTarget() {
  const number = process.env.HUMAN_REVIEW_TARGET_NUMBER;
  const type = process.env.HUMAN_REVIEW_TARGET_TYPE;
  if (!number || !type) return {};
  if (type === 'pr') {
    const pr = gh(['pr', 'view', number, '--json', 'number,title,url,headRefName'], {
      parseJson: true,
    });
    return {
      pullRequest: {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        branch: pr.headRefName,
      },
    };
  }
  const issue = gh(['issue', 'view', number, '--json', 'number,title,url'], {
    parseJson: true,
  });
  return {
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
    },
  };
}

// Colors picked to be distinctive on Discord's dark theme.
const COLOR_ROUTE_HUMAN = 0xe88d67;  // amber — requires attention
const COLOR_APPROVE = 0x0e8a16;      // green
const COLOR_REQUEST = 0xfbca04;      // yellow
const COLOR_BLOCK = 0xb60205;        // red

function buildEmbed({
  color,
  title,
  description,
  url,
  fields,
}) {
  const embed = {
    color,
    title,
    description,
    timestamp: new Date().toISOString(),
  };
  if (url) embed.url = url;
  if (fields && fields.length > 0) embed.fields = fields;
  return embed;
}

// Link buttons (style 5). Discord renders these as clickable buttons on
// messages from app-owned webhooks; on non-app webhooks they fall back to
// plain URLs in content. We ALSO include markdown links in the content body
// as a universal fallback so Ernie always has a one-click path.
function buildLinkButtons(actions) {
  if (!actions || actions.length === 0) return undefined;
  return [
    {
      type: 1,
      components: actions.map((a) => ({
        type: 2,
        style: 5,
        label: a.label,
        url: a.url,
      })),
    },
  ];
}

async function send(webhookUrl, botToken, channelId, body) {
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Discord webhook failed with HTTP ${response.status}: ${text}`
      );
    }
    return;
  }
  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord API failed with HTTP ${response.status}: ${text}`);
  }
}

async function main() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!webhookUrl && !(botToken && channelId)) {
    console.log(
      'DISCORD_WEBHOOK_URL/DISCORD_WEBHOOK or DISCORD_BOT_TOKEN+DISCORD_CHANNEL_ID not set; skipping route-human notification.'
    );
    return;
  }

  const payload = readEventPayload();
  const manualTarget = loadManualTarget();
  const issue = manualTarget.issue || payload.issue
    ? {
        number: (manualTarget.issue || payload.issue).number,
        title: (manualTarget.issue || payload.issue).title,
        url: (manualTarget.issue || payload.issue).url || payload.issue?.html_url,
      }
    : undefined;
  const pullRequest = manualTarget.pullRequest || payload.pull_request
    ? {
        number: (manualTarget.pullRequest || payload.pull_request).number,
        title: (manualTarget.pullRequest || payload.pull_request).title,
        url: (manualTarget.pullRequest || payload.pull_request).url || payload.pull_request?.html_url,
      }
    : undefined;
  const branch =
    manualTarget.pullRequest?.branch ||
    process.env.GITHUB_HEAD_REF ||
    payload.pull_request?.head?.ref ||
    process.env.GITHUB_REF_NAME ||
    '';

  const capabilityLabel =
    process.env.CAPABILITY_LABEL || 'capability authoring';
  const requestedAction =
    process.env.HUMAN_REVIEW_ACTION ||
    'review the capability authoring result and decide whether to merge';
  const reason =
    process.env.HUMAN_REVIEW_REASON ||
    'A capability-authoring branch or issue was explicitly routed to human review.';

  const primaryTarget = pullRequest ?? issue;
  const title = primaryTarget
    ? `aether · route-human · ${primaryTarget.title ?? `#${primaryTarget.number}`}`
    : 'aether · route-human';
  const primaryUrl = primaryTarget?.url;

  const fields = [
    { name: 'action', value: requestedAction, inline: false },
    { name: 'reason', value: reason, inline: false },
  ];
  if (capabilityLabel) {
    fields.unshift({ name: 'capability', value: capabilityLabel, inline: true });
  }
  if (branch) fields.push({ name: 'branch', value: `\`${branch}\``, inline: true });
  if (pullRequest?.number) {
    fields.push({
      name: 'PR',
      value: `[#${pullRequest.number}](${pullRequest.url})`,
      inline: true,
    });
  }
  if (issue?.number) {
    fields.push({
      name: 'issue',
      value: `[#${issue.number}](${issue.url})`,
      inline: true,
    });
  }

  const actions = [];
  if (pullRequest?.url) {
    actions.push({ label: 'Open PR', url: pullRequest.url });
    actions.push({ label: 'Review diff', url: `${pullRequest.url}/files` });
    actions.push({ label: 'Comment', url: `${pullRequest.url}#issuecomment-new` });
  } else if (issue?.url) {
    actions.push({ label: 'Open issue', url: issue.url });
    actions.push({ label: 'Comment', url: `${issue.url}#issuecomment-new` });
  }

  // Plain-text fallback included in content so even bare webhooks (non-app,
  // no button rendering) still give Ernie a single clickable link on mobile.
  const contentLines = [];
  if (primaryUrl) contentLines.push(primaryUrl);
  const content = contentLines.join('\n') || undefined;

  const body = {
    content,
    embeds: [
      buildEmbed({
        color: COLOR_ROUTE_HUMAN,
        title,
        description: [
          `**${capabilityLabel}** — needs human review`,
          reason,
        ].join('\n\n'),
        url: primaryUrl,
        fields,
      }),
    ],
    components: buildLinkButtons(actions),
    allowed_mentions: { parse: [] },
  };

  await send(webhookUrl, botToken, channelId, body);
  console.log('Sent route-human Discord notification.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
