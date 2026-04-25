/**
 * Shared reference-file size limits and error helpers used by:
 *  - components/composer/PromptComposer (MAX_REF_BYTES)
 *  - components/rail/sections/ReferencesImagesTab (MAX_REF_BYTES)
 *  - app/api/reference-ingest/route.ts (MAX_REF_BYTES)
 *
 * Single source so the limit and the user-facing message stay in sync.
 */

export const MAX_REF_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Returns a human-readable skip message that includes the file's actual size
 * and the current limit, e.g. "hero.png is 12.4MB — over 20MB limit".
 */
export function formatRefSizeError(file: { name: string; size: number }): string {
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  return `${file.name} is ${mb}MB — over 20MB limit`;
}
