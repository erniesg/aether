export interface HumanReviewLink {
  number: number;
  title?: string;
  url: string;
}

export interface DiscordHumanReviewMessageInput {
  capabilityLabel: string;
  requestedAction: string;
  reason: string;
  route: 'route-human';
  issue?: HumanReviewLink;
  pullRequest?: HumanReviewLink;
  branch?: string;
}

export interface DiscordHumanReviewEnv {
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK?: string;
}

export function isDiscordHumanReviewConfigured(env: DiscordHumanReviewEnv): boolean {
  return Boolean(env.DISCORD_WEBHOOK_URL || env.DISCORD_WEBHOOK);
}

export function buildDiscordHumanReviewMessage(
  input: DiscordHumanReviewMessageInput
): string {
  const lines = [
    `aether · ${input.route}`,
    `Capability: ${input.capabilityLabel}`,
    `Action: ${input.requestedAction}`,
    `Reason: ${input.reason}`,
  ];

  if (input.issue) {
    const title = input.issue.title ? ` · ${input.issue.title}` : '';
    lines.push(`Issue: #${input.issue.number}${title} · ${input.issue.url}`);
  }

  if (input.pullRequest) {
    lines.push(`PR: #${input.pullRequest.number} · ${input.pullRequest.url}`);
  }

  if (input.branch) {
    lines.push(`Branch: ${input.branch}`);
  }

  return lines.join('\n');
}
