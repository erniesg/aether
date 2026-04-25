/**
 * Convex doc fields cap at 1MB; OpenAI gpt-image-1 returns base64 inline (`b64_json`)
 * which we surface as `data:image/png;base64,...` URLs that routinely run >3MB.
 * Persisting one of those into the `runs.imageUrl` field throws
 * `[CONVEX M(runs:finish)] Server Error` and leaves the run permanently in
 * `step: 'placing'`, which is what bricks the composer status indicator.
 *
 * The image itself lives on the tldraw canvas as a local asset; the run record
 * only needs a pointer when the URL is durable. So: drop data URLs and
 * outsized strings before they hit Convex.
 *
 * Threshold of 256KB is a defensive ceiling that comfortably fits any real
 * https/r2 URL while still rejecting any inline-encoded payload.
 */
export const CONVEX_IMAGE_URL_LIMIT_BYTES = 256 * 1024;

export function sanitizeImageUrlForConvex(
  url: string | undefined | null
): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('data:')) return undefined;
  // Convex strings are stored as UTF-8; for ASCII URLs `length === byteLength`.
  // Real URLs are well under the cap, so the simple length check is enough.
  if (url.length > CONVEX_IMAGE_URL_LIMIT_BYTES) return undefined;
  return url;
}
