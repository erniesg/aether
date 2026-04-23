import { describe, expect, it } from 'vitest';
import {
  buildDiscordHumanReviewMessage,
  isDiscordHumanReviewConfigured,
} from '@/lib/review/discordHumanReview';

describe('Discord human-review notification', () => {
  it('builds a creator-readable review message with issue, PR, and branch context', () => {
    const message = buildDiscordHumanReviewMessage({
      capabilityLabel: 'hero splat',
      requestedAction: 'review and merge the capability authoring branch',
      reason: 'new execution primitive required for spatial output',
      issue: {
        number: 39,
        title: 'Capability factory foundation — explicit tool/workflow/skill registries',
        url: 'https://github.com/erniesg/aether/issues/39',
      },
      pullRequest: {
        number: 52,
        url: 'https://github.com/erniesg/aether/pull/52',
      },
      branch: 'phase/39-capability-factory-foundation',
      route: 'route-human',
    });

    expect(message).toContain('route-human');
    expect(message).toContain('hero splat');
    expect(message).toContain('#39');
    expect(message).toContain('#52');
    expect(message).toContain('phase/39-capability-factory-foundation');
    expect(message).toContain('review and merge');
  });

  it('treats either DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK as sufficient configuration', () => {
    expect(isDiscordHumanReviewConfigured({ DISCORD_WEBHOOK_URL: 'https://discord.test/hook' })).toBe(
      true
    );
    expect(isDiscordHumanReviewConfigured({ DISCORD_WEBHOOK: 'https://discord.test/hook' })).toBe(
      true
    );
    expect(isDiscordHumanReviewConfigured({})).toBe(false);
  });
});
