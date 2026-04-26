/**
 * Discord webhook notification — handoff §9 ("notify me" mode).
 *
 * Posts a single message to `DISCORD_WEBHOOK_URL`. Fail-soft: a missing
 * webhook URL or a non-2xx response returns `false` rather than throwing,
 * so the orchestrator that calls this never blocks on a notification.
 */

export interface DiscordNotifyInput {
  /** The message body. Discord renders Markdown. Keep it short. */
  content: string;
  /** Optional override; defaults to `process.env.DISCORD_WEBHOOK_URL`. */
  webhookUrl?: string;
}

export async function notifyDiscord(input: DiscordNotifyInput): Promise<boolean> {
  const url = input.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.content }),
    });
    return r.ok;
  } catch (err) {
    console.error('[notify/discord] webhook post failed', err);
    return false;
  }
}
