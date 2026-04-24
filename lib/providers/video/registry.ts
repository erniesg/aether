import {
  VideoProviderUnavailableError,
  type VideoGenProvider,
  type VideoProviderId,
  type VideoProviderStatus,
} from './types';
import { createHyperframesVideoProvider } from './hyperframes';
import { createReplicateVideoProvider } from './replicate';

const KNOWN_VIDEO_PROVIDER_IDS: VideoProviderId[] = [
  'hyperframes',
  'remotion',
  'volcengine',
  'replicate',
];

function envConfigured(providerId: VideoProviderId): boolean {
  switch (providerId) {
    case 'hyperframes':
      return true;
    case 'remotion':
      return Boolean(process.env.REMOTION_RENDER_URL);
    case 'volcengine':
      return Boolean(process.env.VOLCENGINE_ARK_API_KEY);
    case 'replicate':
      return Boolean(process.env.REPLICATE_API_TOKEN);
  }
}

function unavailableReason(providerId: VideoProviderId): string | undefined {
  switch (providerId) {
    case 'hyperframes':
      return undefined;
    case 'remotion':
      return 'REMOTION_RENDER_URL is not configured';
    case 'volcengine':
      return 'VOLCENGINE_ARK_API_KEY is not configured';
    case 'replicate':
      return 'REPLICATE_API_TOKEN is not configured';
  }
}

function createProvider(
  id: VideoProviderId,
  displayName: string,
  models: string[],
  flags: Pick<
    VideoGenProvider,
    | 'supportsTextToVideo'
    | 'supportsImageToVideo'
    | 'supportsSceneSpec'
    | 'supportsAudioSync'
  >
): VideoGenProvider {
  return {
    id,
    displayName,
    ...flags,
    isAvailable: () => envConfigured(id),
    getAvailabilityIssue: () => (envConfigured(id) ? undefined : unavailableReason(id)),
    listModels: () => models,
    async generate() {
      throw new VideoProviderUnavailableError(id, unavailableReason(id));
    },
  };
}

export function listVideoProviders(): VideoGenProvider[] {
  return [
    createHyperframesVideoProvider(),
    createProvider('remotion', 'Remotion renderer', ['remotion-scene-spec'], {
      supportsTextToVideo: false,
      supportsImageToVideo: false,
      supportsSceneSpec: true,
      supportsAudioSync: true,
    }),
    createProvider('volcengine', 'Volcengine Ark video', ['seedance-2.0'], {
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsSceneSpec: false,
      supportsAudioSync: false,
    }),
    createReplicateVideoProvider(),
  ];
}

export function listVideoProviderStatuses(): VideoProviderStatus[] {
  return listVideoProviders().map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    models: provider.listModels(),
    supportsTextToVideo: provider.supportsTextToVideo,
    supportsImageToVideo: provider.supportsImageToVideo,
    supportsSceneSpec: provider.supportsSceneSpec,
    supportsAudioSync: provider.supportsAudioSync,
    available: provider.isAvailable(),
    unavailableReason: provider.getAvailabilityIssue(),
  }));
}

export function resolveVideoProvider(
  providerId?: string,
  model?: string
): VideoGenProvider {
  const providers = listVideoProviders();
  const selectedProviderId = providerId ?? process.env.VIDEO_PROVIDER;
  const hyperframesProvider = providers.find((provider) => provider.id === 'hyperframes');
  if (!providerId && process.env.VIDEO_PROVIDER) {
    const envProvider = providers.find((provider) => provider.id === process.env.VIDEO_PROVIDER);
    if (envProvider && !envProvider.isAvailable() && hyperframesProvider) {
      return hyperframesProvider;
    }
  }
  const requested = selectedProviderId
    ? providers.find((provider) => provider.id === selectedProviderId)
    : hyperframesProvider ??
      providers.find((provider) => provider.isAvailable()) ??
      providers[0];

  if (!requested) {
    throw new VideoProviderUnavailableError(
      selectedProviderId ?? 'auto',
      `unknown video provider. Known providers: ${KNOWN_VIDEO_PROVIDER_IDS.join(', ')}`
    );
  }

  if (model && !requested.listModels().includes(model)) {
    throw new VideoProviderUnavailableError(
      requested.id,
      `model '${model}' is not registered for ${requested.id}`
    );
  }

  if (!requested.isAvailable()) {
    throw new VideoProviderUnavailableError(
      requested.id,
      requested.getAvailabilityIssue()
    );
  }

  return requested;
}
