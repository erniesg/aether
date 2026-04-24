import fs from 'node:fs';

function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return {};
  return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
}

function buildMessage({ route, capabilityLabel, requestedAction, reason, issue, pullRequest, branch }) {
  const lines = [
    `aether · ${route}`,
    `Capability: ${capabilityLabel}`,
    `Action: ${requestedAction}`,
    `Reason: ${reason}`,
  ];

  if (issue?.number && issue?.url) {
    const title = issue.title ? ` · ${issue.title}` : '';
    lines.push(`Issue: #${issue.number}${title} · ${issue.url}`);
  }
  if (pullRequest?.number && pullRequest?.url) {
    lines.push(`PR: #${pullRequest.number} · ${pullRequest.url}`);
  }
  if (branch) {
    lines.push(`Branch: ${branch}`);
  }

  return lines.join('\n');
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
  const issue = payload.issue
    ? {
        number: payload.issue.number,
        title: payload.issue.title,
        url: payload.issue.html_url,
      }
    : undefined;
  const pullRequest = payload.pull_request
    ? {
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        url: payload.pull_request.html_url,
      }
    : undefined;
  const branch =
    process.env.GITHUB_HEAD_REF ||
    payload.pull_request?.head?.ref ||
    process.env.GITHUB_REF_NAME ||
    '';

  const content = buildMessage({
    route: 'route-human',
    capabilityLabel: process.env.CAPABILITY_LABEL || 'capability authoring',
    requestedAction:
      process.env.HUMAN_REVIEW_ACTION || 'review the capability authoring result and decide whether to merge',
    reason:
      process.env.HUMAN_REVIEW_REASON ||
      'A capability-authoring branch or issue was explicitly routed to human review.',
    issue,
    pullRequest,
    branch,
  });

  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed with HTTP ${response.status}`);
    }
  } else {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`Discord API failed with HTTP ${response.status}`);
    }
  }

  console.log('Sent route-human Discord notification.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
