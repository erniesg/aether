import { createPreviewPublisher } from './preview';
import { createInMemoryScheduledPostStorage } from './memory-storage';
import {
  PublisherUnavailableError,
  type PublisherProvider,
  type PublisherProviderId,
  type ScheduledPostStorage,
} from './types';

/**
 * Publisher adapter selection. M1 ships `preview` only — postiz /
 * social-auto-upload are reserved ids so the agent loop's config files can
 * point at them ahead of the adapter implementations landing.
 *
 * Precedence when resolving:
 *   1. explicit `preferredId`
 *   2. env `PUBLISHER_PROVIDER`
 *   3. iteration order (preview first, since it has no credential dependency)
 *
 * If the chosen adapter isn't implemented yet, `resolvePublisher` throws
 * `PublisherUnavailableError` — callers turn that into a visible empty state,
 * not a silent fallback, so creators know why no posting happened.
 */

export const KNOWN_PUBLISHER_IDS: ReadonlyArray<PublisherProviderId> = [
  'preview',
  'postiz',
  'social-auto-upload',
];

export interface ResolvePublisherOptions {
  workspaceId: string;
  storage: ScheduledPostStorage;
  preferredId?: string;
  baseUrl?: string;
}

export function resolvePublisher(
  opts: ResolvePublisherOptions
): PublisherProvider {
  const envDefault = process.env.PUBLISHER_PROVIDER;
  const order = [opts.preferredId, envDefault, 'preview'].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );
  // Silent fall-through for unshipped stubs (postiz / social-auto-upload),
  // matching lib/providers/image/registry.ts behaviour. If an explicit
  // preferredId was given and nothing matched, throw so the caller can show
  // a clear error instead of silently picking preview.
  for (const id of order) {
    if (id === 'preview') {
      return createPreviewPublisher({
        workspaceId: opts.workspaceId,
        storage: opts.storage,
        baseUrl: opts.baseUrl,
      });
    }
    // postiz / social-auto-upload are known ids with no adapter yet; skip.
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
  return [{ id: 'preview', displayName: 'preview (no posting)' }];
}

/** Re-export for tests that want to build an ephemeral publisher quickly. */
export function createInMemoryStorageForTests(): ScheduledPostStorage {
  return createInMemoryScheduledPostStorage();
}
