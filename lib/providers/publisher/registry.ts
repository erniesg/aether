import { createPreviewPublisher } from './preview';
import { createInMemoryScheduledPostStorage } from './memory-storage';
import { createPostizPublisherFromEnv } from './postiz';
import {
  createSocialAutoUploadPublisher,
  isSocialAutoUploadPublisherConfigured,
} from './social-auto-upload';
import {
  createXPublisherFromEnv,
  isXPublisherConfigured,
} from './x';
import {
  createInstagramPublisherFromEnv,
  isInstagramPublisherConfigured,
} from './instagram';
import {
  createPinterestPublisherFromEnv,
  isPinterestPublisherConfigured,
} from './pinterest';
import {
  PublisherUnavailableError,
  type PublisherProvider,
  type PublisherProviderId,
  type ScheduledPost,
  type ScheduledPostStorage,
} from './types';

/**
 * Publisher adapter selection. `preview` is always available for local creator
 * review. `postiz` becomes available when the API key and at least one
 * platform integration id are present. `x` and `instagram` become available
 * when their respective env vars are configured (see x.ts / instagram.ts for
 * credential setup instructions).
 *
 * Precedence when resolving for a specific post (resolvePublisherForPost):
 *   1. explicit `preferredId`
 *   2. env `PUBLISHER_PROVIDER`
 *   3. x      — when post.platform === 'x' AND X_API_KEY etc. are set
 *   4. instagram — when post.platform === 'instagram' AND IG_ACCESS_TOKEN etc.
 *   5. postiz
 *   6. social-auto-upload
 *   7. preview (always available, no credentials)
 *
 * If the chosen adapter is unavailable, resolution falls through to preview
 * unless the caller made an explicit provider request.
 */

export const KNOWN_PUBLISHER_IDS: ReadonlyArray<PublisherProviderId> = [
  'preview',
  'postiz',
  'social-auto-upload',
  'x',
  'instagram',
  'pinterest',
];

export interface ResolvePublisherOptions {
  workspaceId: string;
  storage?: ScheduledPostStorage;
  preferredId?: string;
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvePublisherForPostOptions extends ResolvePublisherOptions {
  post: Parameters<PublisherProvider['canPublish']>[0];
}

function instantiatePublisher(
  id: string,
  opts: ResolvePublisherOptions
): PublisherProvider | null {
  if (id === 'postiz') {
    return createPostizPublisherFromEnv(
      {
        workspaceId: opts.workspaceId,
        storage: opts.storage,
        baseUrl: opts.baseUrl,
      },
      opts.env
    );
  }
  if (id === 'social-auto-upload' && isSocialAutoUploadPublisherConfigured(opts.env)) {
    return createSocialAutoUploadPublisher({ workspaceId: opts.workspaceId });
  }
  if (id === 'x') {
    return createXPublisherFromEnv({}, opts.env);
  }
  if (id === 'instagram') {
    return createInstagramPublisherFromEnv({}, opts.env);
  }
  if (id === 'pinterest') {
    return createPinterestPublisherFromEnv({}, opts.env);
  }
  if (id === 'preview') {
    return createPreviewPublisher({
      workspaceId: opts.workspaceId,
      storage: opts.storage,
      baseUrl: opts.baseUrl,
    });
  }
  return null;
}

export function resolvePublisher(
  opts: ResolvePublisherOptions
): PublisherProvider {
  const envDefault = process.env.PUBLISHER_PROVIDER;
  const order = [opts.preferredId, envDefault, 'preview'].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );
  for (const id of order) {
    const publisher = instantiatePublisher(id, opts);
    if (publisher) return publisher;
    if (id === 'postiz' && opts.preferredId === 'postiz') {
      throw new PublisherUnavailableError(
        'postiz',
        'POSTIZ_API_KEY and POSTIZ_INTEGRATION_<PLATFORM> are required'
      );
    }
  }
  throw new PublisherUnavailableError(
    opts.preferredId ?? 'any',
    `no publisher adapter matched (checked: ${KNOWN_PUBLISHER_IDS.join(', ')})`
  );
}

/**
 * Platform-aware resolution for real publishing. Unlike `resolvePublisher`,
 * this does not let preview win before configured real adapters have had a
 * chance to claim the post. That allows one export pack to route Western
 * platforms to direct adapters / Postiz and CJK/browser-automation platforms
 * to the Python sidecar.
 *
 * Precedence:
 *   explicit override → env PUBLISHER_PROVIDER → x (X posts) →
 *   instagram (IG posts) → postiz → social-auto-upload → preview
 */
export function resolvePublisherForPost(
  opts: ResolvePublisherForPostOptions
): PublisherProvider {
  const envDefault = process.env.PUBLISHER_PROVIDER;
  const order = [
    opts.preferredId,
    envDefault,
    'x',
    'instagram',
    'pinterest',
    'postiz',
    'social-auto-upload',
    'preview',
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);

  const seen = new Set<string>();
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const publisher = instantiatePublisher(id, opts);
    if (publisher?.canPublish(opts.post)) return publisher;
  }

  throw new PublisherUnavailableError(
    opts.preferredId ?? (opts.post as ScheduledPost).platform,
    `no publisher adapter can publish ${(opts.post as ScheduledPost).platform}`
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
  if (isSocialAutoUploadPublisherConfigured()) {
    list.push({ id: 'social-auto-upload', displayName: 'social-auto-upload' });
  }
  if (isXPublisherConfigured(process.env)) {
    list.push({ id: 'x', displayName: 'X (Twitter)' });
  }
  if (isInstagramPublisherConfigured(process.env)) {
    list.push({ id: 'instagram', displayName: 'Instagram' });
  }
  if (isPinterestPublisherConfigured(process.env)) {
    list.push({ id: 'pinterest', displayName: 'Pinterest' });
  }
  return list;
}

/** Re-export for tests that want to build an ephemeral publisher quickly. */
export function createInMemoryStorageForTests(): ScheduledPostStorage {
  return createInMemoryScheduledPostStorage();
}
