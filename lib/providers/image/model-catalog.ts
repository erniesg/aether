export interface ImageModelOption {
  value: string;
  label: string;
}

export const REPLICATE_DEFAULT_IMAGE_MODEL = 'bytedance/seedream-5-lite';

export const IMAGE_MODEL_OPTIONS: Record<string, readonly ImageModelOption[]> = {
  openai: [
    { value: 'gpt-image-2', label: 'gpt-image-2' },
    { value: 'gpt-image-1.5', label: 'gpt-image-1.5' },
    { value: 'gpt-image-1', label: 'gpt-image-1' },
  ],
  gemini: [
    { value: 'imagen-4.0-generate-001', label: 'imagen-4' },
    { value: 'imagen-4.0-fast-generate-001', label: 'imagen-4 fast' },
    { value: 'imagen-3.0-generate-002', label: 'imagen-3' },
    { value: 'gemini-2.5-flash-image-preview', label: 'gemini flash image' },
  ],
  replicate: [
    { value: REPLICATE_DEFAULT_IMAGE_MODEL, label: 'seedream 5 lite' },
    { value: 'google/nano-banana-pro', label: 'nano banana pro' },
    { value: 'google/nano-banana-2', label: 'nano banana 2' },
    { value: 'google/nano-banana', label: 'nano banana' },
    { value: 'openai/gpt-image-2', label: 'gpt-image-2' },
    { value: 'black-forest-labs/flux-2-pro', label: 'flux 2 pro' },
    { value: 'black-forest-labs/flux-1.1-pro', label: 'flux 1.1 pro' },
    { value: 'black-forest-labs/flux-1.1-pro-ultra', label: 'flux 1.1 pro ultra' },
    { value: 'ideogram-ai/ideogram-v3-turbo', label: 'ideogram v3 turbo' },
    { value: 'stability-ai/stable-diffusion-3.5-large', label: 'sd 3.5 large' },
  ],
  volcengine: [
    { value: 'doubao-seedream-3-0-t2i-250415', label: 'seedream 3' },
  ],
};

const MODEL_ALIASES: Record<string, Record<string, string>> = {
  replicate: {
    seedream: REPLICATE_DEFAULT_IMAGE_MODEL,
    'seedream-5': REPLICATE_DEFAULT_IMAGE_MODEL,
    'seedream-5-lite': REPLICATE_DEFAULT_IMAGE_MODEL,
    'seedream-lite-5': REPLICATE_DEFAULT_IMAGE_MODEL,
    'seedream 5 lite': REPLICATE_DEFAULT_IMAGE_MODEL,
    'seedream 5.0 lite': REPLICATE_DEFAULT_IMAGE_MODEL,
    'nano-banana-pro': 'google/nano-banana-pro',
    'nano banana pro': 'google/nano-banana-pro',
    'nano-banana-2': 'google/nano-banana-2',
    'nano banana 2': 'google/nano-banana-2',
    'nano-banana': 'google/nano-banana',
    'nano banana': 'google/nano-banana',
    'gpt-image-2': 'openai/gpt-image-2',
    'openai/gpt-image-2': 'openai/gpt-image-2',
  },
};

export function imageModelOptionsForProvider(providerId?: string): readonly ImageModelOption[] {
  if (!providerId) return [];
  return IMAGE_MODEL_OPTIONS[providerId] ?? [];
}

export function defaultImageModelForProvider(providerId?: string): string | undefined {
  return imageModelOptionsForProvider(providerId)[0]?.value;
}

export function normalizeImageModelId(
  providerId: string | undefined,
  model: string | undefined
): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed) return undefined;
  const providerAliases = providerId ? MODEL_ALIASES[providerId] : undefined;
  const aliased = providerAliases?.[trimmed.toLowerCase()];
  return aliased ?? trimmed;
}

export function isKnownImageModel(providerId: string, model: string): boolean {
  const normalized = normalizeImageModelId(providerId, model);
  if (!normalized) return false;
  return imageModelOptionsForProvider(providerId).some((option) => option.value === normalized);
}
