import crypto from 'node:crypto';

/**
 * Computes the CRC challenge response token required by the X Account Activity API.
 * X sends GET ?crc_token=<random> when registering a webhook URL.
 * The response must be: sha256=base64(HMAC-SHA256(crc_token, consumer_secret))
 */
export function computeCrcResponse(crcToken: string, secret: string): string {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(crcToken)
    .digest('base64');
  return `sha256=${digest}`;
}

/**
 * Verifies the x-twitter-webhooks-signature header against the raw request body.
 * X computes: sha256=base64(HMAC-SHA256(raw_body, consumer_secret))
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = computeCrcResponse(rawBody, secret);

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
