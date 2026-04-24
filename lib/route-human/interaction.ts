import { GithubClient } from './github';
import { verifyDiscordSignature } from './signature';
import { BUTTON_PREFIX, MODAL_PREFIX } from './types';

// Discord interaction type constants (from Discord API reference).
export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
} as const;

export const INTERACTION_RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  MODAL: 9,
} as const;

export const LABELS = {
  CLAUDE_RUN: 'claude-run',
  QUEUE_PAUSED: 'queue-paused',
  READY_FOR_ERNIE: 'ready-for-ernie',
  DEPENDS_ON_PR: (prNumber: number) => `depends-on:pr-${prNumber}`,
} as const;

export type InteractionDeps = {
  github: GithubClient;
};

export type HandleInteractionInput = {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
};

export type InteractionResponseJson = Record<string, unknown>;

export type InteractionResult =
  | { ok: true; status: 200; json: InteractionResponseJson }
  | { ok: false; status: number; error: string };

function parseCustomId(id: string): { action: string; prNumber: number } | null {
  // Custom IDs use `<action>_<number>` where action may itself contain
  // underscores (e.g. `request_changes_57`). Split off the trailing number.
  const match = /^(.*)_(\d+)$/.exec(id);
  if (!match) return null;
  return { action: match[1], prNumber: Number(match[2]) };
}

function ephemeral(content: string): InteractionResponseJson {
  return {
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: 1 << 6, // EPHEMERAL
      allowed_mentions: { parse: [] },
    },
  };
}

async function onMerge(prNumber: number, deps: InteractionDeps): Promise<InteractionResponseJson> {
  await deps.github.mergePr(prNumber, `Merge pull request #${prNumber} (Discord ack)`);

  // Cascade: any open issue labeled `depends-on:pr-<prNumber>` is now
  // unblocked. Re-dispatch by adding `claude-run`.
  const dependents = await deps.github.listOpenIssuesByLabel(LABELS.DEPENDS_ON_PR(prNumber));
  for (const issue of dependents) {
    if (!issue.labels.includes(LABELS.CLAUDE_RUN)) {
      await deps.github.addLabel(issue.number, LABELS.CLAUDE_RUN);
    }
  }

  return ephemeral(
    `✓ Merged PR #${prNumber}. Re-dispatched ${dependents.length} dependent issue${
      dependents.length === 1 ? '' : 's'
    }.`
  );
}

async function onRequestChangesButton(prNumber: number): Promise<InteractionResponseJson> {
  // Respond with a modal that asks for the feedback text. Modal submit
  // (custom_id `request_changes_modal_<n>`) does the actual side effects.
  return {
    type: INTERACTION_RESPONSE_TYPE.MODAL,
    data: {
      custom_id: `${MODAL_PREFIX.REQUEST_CHANGES}_${prNumber}`,
      title: `Request changes on PR #${prNumber}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4, // TEXT_INPUT
              custom_id: 'feedback',
              label: 'What needs to change?',
              style: 2, // paragraph
              min_length: 1,
              max_length: 2000,
              required: true,
              placeholder: 'Plain-English feedback — the agent will read this and retry.',
            },
          ],
        },
      ],
    },
  };
}

async function onRequestChangesModal(
  prNumber: number,
  feedback: string,
  deps: InteractionDeps
): Promise<InteractionResponseJson> {
  const body =
    `**Review feedback from Ernie (via Discord):**\n\n${feedback}\n\n` +
    `_Re-dispatching \`claude-run\` — the author agent will pick this up automatically._`;
  await deps.github.addComment(prNumber, body);
  // PR number == issue number on GitHub — re-adding `claude-run` to the PR
  // (which is also an issue) is enough to re-trigger the agent.
  await deps.github.addLabel(prNumber, LABELS.CLAUDE_RUN);
  return ephemeral(`↻ Feedback posted on PR #${prNumber}; \`claude-run\` re-added.`);
}

async function onPause(prNumber: number, deps: InteractionDeps): Promise<InteractionResponseJson> {
  const running = await deps.github.listOpenIssuesByLabel(LABELS.CLAUDE_RUN);
  for (const issue of running) {
    await deps.github.removeLabel(issue.number, LABELS.CLAUDE_RUN);
    if (!issue.labels.includes(LABELS.QUEUE_PAUSED)) {
      await deps.github.addLabel(issue.number, LABELS.QUEUE_PAUSED);
    }
  }
  return ephemeral(
    `⏸ Queue paused. Stripped \`claude-run\` from ${running.length} open issue${
      running.length === 1 ? '' : 's'
    }. (PR #${prNumber} left as-is.)`
  );
}

async function onBlock(prNumber: number, deps: InteractionDeps): Promise<InteractionResponseJson> {
  await deps.github.closePr(prNumber);
  await deps.github.addComment(
    prNumber,
    '✗ Blocked by Ernie via Discord review. Closing — do not re-run.'
  );
  return ephemeral(`✗ PR #${prNumber} blocked and closed.`);
}

type DiscordInteractionPayload = {
  type: number;
  data?: {
    custom_id?: string;
    components?: Array<{
      type: number;
      components?: Array<{
        type: number;
        custom_id?: string;
        value?: string;
      }>;
    }>;
  };
};

export async function handleInteraction(
  input: HandleInteractionInput,
  deps: InteractionDeps
): Promise<InteractionResult> {
  const { rawBody, signature, timestamp, publicKey } = input;

  if (!publicKey) {
    return { ok: false, status: 500, error: 'DISCORD_PUBLIC_KEY not configured' };
  }
  if (!signature || !timestamp) {
    return { ok: false, status: 401, error: 'missing signature headers' };
  }
  const verified = verifyDiscordSignature({
    publicKey,
    signature,
    timestamp,
    body: rawBody,
  });
  if (!verified) {
    return { ok: false, status: 401, error: 'invalid request signature' };
  }

  let payload: DiscordInteractionPayload;
  try {
    payload = JSON.parse(rawBody) as DiscordInteractionPayload;
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON body' };
  }

  if (payload.type === INTERACTION_TYPE.PING) {
    return { ok: true, status: 200, json: { type: INTERACTION_RESPONSE_TYPE.PONG } };
  }

  if (payload.type === INTERACTION_TYPE.MESSAGE_COMPONENT) {
    const customId = payload.data?.custom_id ?? '';
    const parsed = parseCustomId(customId);
    if (!parsed) {
      return { ok: false, status: 400, error: `unknown custom_id: ${customId}` };
    }
    const { action, prNumber } = parsed;
    switch (action) {
      case BUTTON_PREFIX.MERGE:
        return { ok: true, status: 200, json: await onMerge(prNumber, deps) };
      case BUTTON_PREFIX.REQUEST_CHANGES:
        return { ok: true, status: 200, json: await onRequestChangesButton(prNumber) };
      case BUTTON_PREFIX.PAUSE:
        return { ok: true, status: 200, json: await onPause(prNumber, deps) };
      case BUTTON_PREFIX.BLOCK:
        return { ok: true, status: 200, json: await onBlock(prNumber, deps) };
      default:
        return { ok: false, status: 400, error: `unknown action: ${action}` };
    }
  }

  if (payload.type === INTERACTION_TYPE.MODAL_SUBMIT) {
    const customId = payload.data?.custom_id ?? '';
    const modalMatch = /^request_changes_modal_(\d+)$/.exec(customId);
    if (modalMatch) {
      const prNumber = Number(modalMatch[1]);
      const feedback =
        payload.data?.components?.[0]?.components?.find((c) => c.custom_id === 'feedback')
          ?.value ?? '';
      return {
        ok: true,
        status: 200,
        json: await onRequestChangesModal(prNumber, feedback, deps),
      };
    }
    return { ok: false, status: 400, error: `unknown modal custom_id: ${customId}` };
  }

  return { ok: false, status: 400, error: `unsupported interaction type: ${payload.type}` };
}
