/**
 * Background inpainting providers — fill the area covered by a mask with
 * surrounding content so the user gets a clean "background only" layer
 * complementing the SAM3 cutout. Symmetric with the cutout flow: same
 * source image + same mask → two layers (subject on top, bg behind).
 *
 * Convention:
 *   - mask: white pixels = area to inpaint (the subject region, where the
 *     subject WAS — we want to fill it with reconstructed background).
 *     Black pixels = keep the source image untouched.
 *   - SAM3's mask follows this convention (white = subject), so we can
 *     pass it through to LAMA / SDXL inpainting unchanged.
 *
 * Default provider is Replicate (LAMA — content-aware fill, no text prompt
 * needed, fast). Override via INPAINT_PROVIDER_ID + INPAINT_MODEL env.
 */

export const KNOWN_INPAINT_PROVIDER_IDS = ['replicate-lama'] as const;
export type InpaintProviderId = (typeof KNOWN_INPAINT_PROVIDER_IDS)[number];

export interface InpaintRequest {
  /** Source image URL (https or data:). */
  sourceUrl: string;
  /** Mask image URL (https or data:). White = inpaint, black = keep. */
  maskUrl: string;
  /** Optional text prompt — used only by SDXL/SD inpaint adapters; LAMA
   *  ignores this. Suggested default for bg-fill: empty string or
   *  "background, no people". */
  prompt?: string;
  /** Width × height hint; not all providers honour this — LAMA returns
   *  the source image dimensions verbatim. */
  size?: { w: number; h: number };
}

export interface InpaintResult {
  provider: InpaintProviderId;
  model: string;
  /** Public URL or data URL of the inpainted image (full-size, mask
   *  region replaced with surrounding context). */
  imageUrl: string;
  width: number;
  height: number;
  raw?: unknown;
}

export interface InpaintProviderStatus {
  id: InpaintProviderId;
  displayName: string;
  models: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface InpaintProvider {
  id: InpaintProviderId;
  displayName: string;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  listModels(): string[];
  inpaint(req: InpaintRequest, opts: { model: string }): Promise<InpaintResult>;
}

export class InpaintUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `inpaint provider '${providerId}' is unavailable: ${hint}`
        : `inpaint provider '${providerId}' is unavailable`
    );
    this.name = 'InpaintUnavailableError';
  }
}

export class InpaintError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'InpaintError';
  }
}
