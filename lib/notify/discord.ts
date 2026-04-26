/**
 * Discord webhook notification — handoff §9 ("notify me" mode) + the
 * Auto Mode lap lifecycle (start / per-variation / end-by-mode).
 *
 * Posts to `DISCORD_WEBHOOK_URL`. Fail-soft: a missing webhook URL or a
 * non-2xx response returns `false` rather than throwing, so the
 * orchestrator never blocks on a notification.
 *
 * Console fallback: when no webhook is configured, every notification
 * still emits a console log so dev sees the would-have-been pings (the
 * user explicitly asked for visibility on lap start / approval / scheduled).
 */

export interface DiscordNotifyInput {
  /** The message body. Discord renders Markdown. Keep it short. */
  content: string;
  /** Optional override; defaults to `process.env.DISCORD_WEBHOOK_URL`. */
  webhookUrl?: string;
  /** Tag for the console fallback line — helps grep dev logs. */
  tag?: string;
}

export async function notifyDiscord(input: DiscordNotifyInput): Promise<boolean> {
  const url = input.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log(
      `[notify/discord:${input.tag ?? 'msg'} · DISCORD_WEBHOOK_URL not set, skipping ping]`,
      `\n${input.content}`
    );
    return false;
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.content }),
    });
    if (!r.ok) {
      console.error(
        `[notify/discord:${input.tag ?? 'msg'}] webhook returned ${r.status}`
      );
    }
    return r.ok;
  } catch (err) {
    console.error(`[notify/discord:${input.tag ?? 'msg'}] webhook post failed`, err);
    return false;
  }
}
