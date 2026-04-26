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

/**
 * Discord interactive components. Webhooks accept link buttons (style 5)
 * without an Application context; non-link buttons require an interactions
 * endpoint which Aether doesn't run yet, so we restrict to link buttons.
 *
 * Shape: action rows (type 1) wrap component arrays. Each row holds up to
 * 5 buttons. A message can have up to 5 action rows.
 */
export interface DiscordLinkButton {
  type: 2; // BUTTON
  style: 5; // LINK
  label: string;
  url: string;
  /** Optional emoji prefix (Unicode or { name, id } for custom). */
  emoji?: { name: string };
}

export interface DiscordActionRow {
  type: 1; // ACTION_ROW
  components: DiscordLinkButton[];
}

export interface DiscordNotifyInput {
  /** The message body. Discord renders Markdown. Keep it short. */
  content: string;
  /**
   * Optional rich embeds. Up to 10 embeds per message.
   * Each embed renders as a distinct card below the content block.
   */
  embeds?: DiscordEmbed[];
  /** Optional action rows with link buttons. Up to 5 rows per message. */
  components?: DiscordActionRow[];
  /** Optional override; defaults to `process.env.DISCORD_WEBHOOK_URL`. */
  webhookUrl?: string;
  /** Tag for the console fallback line — helps grep dev logs. Also forms
   *  half of the idempotency key when paired with `campaignId`. */
  tag?: string;
  /**
   * When set together with `tag`, the (campaignId, tag) pair is the dedupe
   * key: a second call with the same pair short-circuits to `true`
   * (already-delivered semantics) without re-posting. Lets call sites that
   * may run twice — retries, double-mounts, lap re-entries — avoid firing
   * duplicate Discord pings. Pings without a campaignId are never deduped.
   */
  campaignId?: string;
}

// Module-scoped idempotency set. Process-lifetime; serverless invocations
// get a fresh map per cold start, which matches Discord's "best-effort"
// expectation. Tests reset it between cases via __resetDiscordIdempotency.
const sentKeys = new Set<string>();
// In-flight promises so two concurrent calls with the same key share a
// single fetch — the second awaits the first's result instead of re-firing.
// Cleared on settle (success or failure). On failure, sentKeys is also NOT
// updated, so a subsequent retry can succeed.
const inflight = new Map<string, Promise<boolean>>();

function dedupeKey(
  campaignId: string | undefined,
  tag: string | undefined
): string | null {
  if (!campaignId || !tag) return null;
  return `${campaignId}::${tag}`;
}

/**
 * Test-only helper. Clears the in-memory dedupe set so successive `it`
 * blocks start fresh.
 */
export function __resetDiscordIdempotency(): void {
  sentKeys.clear();
  inflight.clear();
}

async function postWebhook(
  url: string,
  input: DiscordNotifyInput
): Promise<boolean> {
  const body: Record<string, unknown> = { content: input.content };
  if (input.embeds && input.embeds.length > 0) {
    // Discord caps at 10 embeds per message — silently truncate.
    body.embeds = input.embeds.slice(0, 10);
  }
  if (input.components && input.components.length > 0) {
    // Discord caps at 5 action rows per message.
    body.components = input.components.slice(0, 5);
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
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notify/discord:${input.tag ?? 'msg'}] webhook post failed`, err);
    return false;
  }
}

export async function notifyDiscord(input: DiscordNotifyInput): Promise<boolean> {
  const key = dedupeKey(input.campaignId, input.tag);
  if (key && sentKeys.has(key)) {
    console.log(
      `[notify/discord:${input.tag ?? 'msg'} · dedupe-skip campaign=${input.campaignId}]`
    );
    return true;
  }
  // Concurrent same-key call: piggy-back on the in-flight promise rather than
  // firing a second POST.
  if (key) {
    const existing = inflight.get(key);
    if (existing) return existing;
  }

  const url = input.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log(
      `[notify/discord:${input.tag ?? 'msg'} · DISCORD_WEBHOOK_URL not set, skipping ping]`,
      `\n${input.content}`
    );
    return false;
  }

  const job = (async () => {
    const ok = await postWebhook(url, input);
    if (ok && key) sentKeys.add(key);
    return ok;
  })();
  if (key) {
    inflight.set(key, job);
    job.finally(() => {
      // Only clear if this is still the registered promise — guards against
      // a later attempt overwriting the slot.
      if (inflight.get(key) === job) inflight.delete(key);
    });
  }
  return job;
}
