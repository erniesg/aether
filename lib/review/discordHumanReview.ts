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
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
}

export type DiscordHumanReviewDelivery =
  | { kind: 'webhook'; webhookUrl: string }
  | { kind: 'bot'; botToken: string; channelId: string };

export function resolveDiscordHumanReviewDelivery(
  env: DiscordHumanReviewEnv
): DiscordHumanReviewDelivery | null {
  const webhookUrl = env.DISCORD_WEBHOOK_URL || env.DISCORD_WEBHOOK;
  if (webhookUrl) {
    return { kind: 'webhook', webhookUrl };
  }

  if (env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID) {
    return {
      kind: 'bot',
      botToken: env.DISCORD_BOT_TOKEN,
      channelId: env.DISCORD_CHANNEL_ID,
    };
  }

  return null;
}

export function isDiscordHumanReviewConfigured(env: DiscordHumanReviewEnv): boolean {
  return resolveDiscordHumanReviewDelivery(env) !== null;
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
