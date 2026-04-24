import type {
  DiscordActionRow,
  DiscordEmbed,
  DiscordEmbedField,
  DiscordWebhookBody,
  ReviewArtifact,
  ReviewChecklistItem,
  ReviewNotification,
} from './types';
import {
  BUTTON_PREFIX,
  DISCORD_COLOR,
} from './types';

export type { ReviewNotification, DiscordWebhookBody } from './types';

const MAX_EMBEDS = 10; // Discord caps webhook messages at 10 embeds
const MAX_CHECKLIST_CHARS = 1000; // field value limit is 1024

function checklistToField(items: ReviewChecklistItem[]): DiscordEmbedField {
  const lines = items.map((c) => `${c.passed ? '✓' : '✗'} ${c.item}`);
  let value = lines.join('\n');
  if (value.length > MAX_CHECKLIST_CHARS) {
    value = value.slice(0, MAX_CHECKLIST_CHARS - 1) + '…';
  }
  return {
    name: 'Acceptance checklist',
    value: value || '(none)',
    inline: false,
  };
}

function testSummaryToField(s: ReviewNotification['testSummary']): DiscordEmbedField {
  const parts = [`${s.passed}/${s.total} passed`];
  if (s.failed > 0) parts.push(`${s.failed} failed`);
  if (typeof s.coverage === 'number') {
    parts.push(`${Math.round(s.coverage * 100)}% coverage`);
  }
  return {
    name: 'Tests',
    value: parts.join(' · '),
    inline: true,
  };
}

function artifactToExtraEmbed(artifact: ReviewArtifact): DiscordEmbed {
  return {
    description: `${artifact.caption}`,
    image: { url: artifact.url },
  };
}

export function buildDiscordPayload(n: ReviewNotification): DiscordWebhookBody {
  const mainEmbed: DiscordEmbed = {
    title: `✅ ready-for-ernie · ${n.issueTitle} (PR #${n.prNumber})`,
    description: n.reviewerSummary,
    url: n.prUrl,
    color: DISCORD_COLOR.APPROVE,
    fields: [
      checklistToField(n.acceptanceChecklist),
      testSummaryToField(n.testSummary),
    ],
    footer: {
      text: `issue #${n.issueNumber} · ${n.branch} · author ${n.author}`,
    },
    timestamp: new Date().toISOString(),
  };

  const [first, ...rest] = n.artifacts;
  if (first) {
    mainEmbed.image = { url: first.url };
    // Surface the caption inside the main description so context doesn't
    // get lost when the image is the only visible part on mobile.
    mainEmbed.description = `${n.reviewerSummary}\n\n_${first.caption}_`;
  }

  const extraEmbeds = rest.slice(0, MAX_EMBEDS - 1).map(artifactToExtraEmbed);

  const actionRow: DiscordActionRow = {
    type: 1,
    components: [
      {
        type: 2,
        style: 3, // green
        label: '✓ merge',
        custom_id: `${BUTTON_PREFIX.MERGE}_${n.prNumber}`,
      },
      {
        type: 2,
        style: 2, // grey
        label: '↻ request changes',
        custom_id: `${BUTTON_PREFIX.REQUEST_CHANGES}_${n.prNumber}`,
      },
      {
        type: 2,
        style: 4, // red (pause is destructive-ish for the queue)
        label: '⏸ pause queue',
        custom_id: `${BUTTON_PREFIX.PAUSE}_${n.prNumber}`,
      },
      {
        type: 2,
        style: 4, // red
        label: '✗ block',
        custom_id: `${BUTTON_PREFIX.BLOCK}_${n.prNumber}`,
      },
    ],
  };

  return {
    embeds: [mainEmbed, ...extraEmbeds],
    components: [actionRow],
    allowed_mentions: { parse: [] },
  };
}

export type SendOptions = {
  fetchImpl?: typeof fetch;
  webhookUrl?: string;
};

export async function sendReviewNotification(
  n: ReviewNotification,
  options: SendOptions = {}
): Promise<{ messageId: string }> {
  const webhookUrl = options.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error(
      'DISCORD_WEBHOOK_URL is not set — review notification cannot be delivered. ' +
        'Fail closed: review agent CI job should surface this so reviews never silently drop.'
    );
  }

  const body = buildDiscordPayload(n);
  const url = webhookUrl + (webhookUrl.includes('?') ? '&wait=true' : '?wait=true');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Discord webhook POST failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`
    );
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new Error('Discord webhook response did not include a message id');
  }
  return { messageId: json.id };
}
