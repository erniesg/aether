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
 *
 * Embeds: Discord webhooks natively support rich embeds. Pass `embeds` for
 * inline image previews, clickable titles, field tables, and colour coding.
 * The lap-end ping in auto-mode uses this to show one embed per variation
 * with the hero image inline so Ernie can see what was made without clicking
 * through to the app.
 */

/**
 * Discord embed field (one row in the fields table).
 */
export interface DiscordEmbedField {
  name: string;
  value: string;
  /** When true the field renders side-by-side with adjacent inline fields. */
  inline?: boolean;
}

/**
 * Discord rich embed. All fields are optional — include only what you have.
 * See https://discord.com/developers/docs/resources/channel#embed-object for
 * the full spec; we expose the subset that is useful for Auto Mode pings.
 */
export interface DiscordEmbed {
  /** Bold title — rendered as a hyperlink when `url` is also set. */
  title?: string;
  /** Caption below the title. Markdown supported. Max 4096 chars. */
  description?: string;
  /** When set, `title` becomes a clickable link. */
  url?: string;
  /**
   * Left-border accent colour as a decimal integer (0xRRGGBB → decimal).
   * Convenience constants: GREEN=5701191, YELLOW=16737628, RED=15606333.
   */
  color?: number;
  /** Full-width image below the description. */
  image?: { url: string };
  /** Small thumbnail to the right of the title/description block. */
  thumbnail?: { url: string };
  /** Up to 25 key-value fields. */
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  /** ISO-8601 timestamp rendered below the footer. */
  timestamp?: string;
}

export interface DiscordNotifyInput {
  /** The message body. Discord renders Markdown. Keep it short. */
  content: string;
  /**
   * Optional rich embeds. Up to 10 embeds per message.
   * Each embed renders as a distinct card below the content block.
   */
  embeds?: DiscordEmbed[];
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

  const body: Record<string, unknown> = { content: input.content };
  if (input.embeds && input.embeds.length > 0) {
    // Discord caps at 10 embeds per message — silently truncate.
    body.embeds = input.embeds.slice(0, 10);
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
