import { createPreviewPublisher } from './preview';
import { createInMemoryScheduledPostStorage } from './memory-storage';
import { createPostizPublisherFromEnv } from './postiz';
import {
  PublisherUnavailableError,
  type PublisherProvider,
  type PublisherProviderId,
  type ScheduledPostStorage,
} from './types';

/**
 * Publisher adapter selection. `preview` is always available for local creator
 * review. `postiz` becomes available when the API key and at least one
 * platform integration id are present.
 *
 * Precedence when resolving:
 *   1. explicit `preferredId`
 *   2. env `PUBLISHER_PROVIDER`
 *   3. iteration order (preview first, since it has no credential dependency)
 *
 * If the chosen adapter is unavailable, resolution falls through to preview
 * unless the caller made an explicit provider request.
 */

export const KNOWN_PUBLISHER_IDS: ReadonlyArray<PublisherProviderId> = [
  'preview',
  'postiz',
  'social-auto-upload',
];

export interface ResolvePublisherOptions {
  workspaceId: string;
  storage?: ScheduledPostStorage;
  preferredId?: string;
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export function resolvePublisher(
  opts: ResolvePublisherOptions
): PublisherProvider {
  const envDefault = process.env.PUBLISHER_PROVIDER;
  const order = [opts.preferredId, envDefault, 'preview'].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );
  for (const id of order) {
    if (id === 'postiz') {
      const publisher = createPostizPublisherFromEnv(
        {
          workspaceId: opts.workspaceId,
          storage: opts.storage,
          baseUrl: opts.baseUrl,
        },
        opts.env
      );
      if (publisher) return publisher;
      if (opts.preferredId === 'postiz') {
        throw new PublisherUnavailableError(
          'postiz',
          'POSTIZ_API_KEY and POSTIZ_INTEGRATION_<PLATFORM> are required'
        );
      }
    }
    if (id === 'preview') {
      return createPreviewPublisher({
        workspaceId: opts.workspaceId,
        storage: opts.storage,
        baseUrl: opts.baseUrl,
      });
    }
  }
  throw new PublisherUnavailableError(
    opts.preferredId ?? 'any',
    `no publisher adapter matched (checked: ${KNOWN_PUBLISHER_IDS.join(', ')})`
  );
}

export function listAvailablePublishers(): Array<{
  id: PublisherProviderId;
  displayName: string;
}> {
  const list: Array<{ id: PublisherProviderId; displayName: string }> = [
    { id: 'preview', displayName: 'preview' },
  ];
  if (createPostizPublisherFromEnv({
    workspaceId: 'availability-check',
    storage: createInMemoryScheduledPostStorage(),
  })) {
    list.push({ id: 'postiz', displayName: 'Postiz' });
  }
  return list;
}

/** Re-export for tests that want to build an ephemeral publisher quickly. */
export function createInMemoryStorageForTests(): ScheduledPostStorage {
  return createInMemoryScheduledPostStorage();
}
