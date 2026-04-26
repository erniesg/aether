import {
  PublisherError,
  PublisherUnavailableError,
  type PublisherProvider,
  type PublishPlatform,
  type ScheduledPost,
  type ScheduledPostStorage,
  type ScheduleResult,
} from './types';

const PROVIDER_ID = 'postiz' as const;
const DEFAULT_API_BASE_URL = 'https://api.postiz.com/public/v1';

export interface PostizPublisherOptions {
  workspaceId: string;
  apiKey: string;
  apiBaseUrl?: string;
  integrationIds: Partial<Record<PublishPlatform, string>>;
  pinterestBoardId?: string;
  pinterestLinkUrl?: string;
  storage?: ScheduledPostStorage;
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface PostizUpload {
  id: string;
  path: string;
  name?: string;
}

interface PostizCreateResponse {
  postId?: string;
  integration?: string;
  id?: string;
}

type PostizSettings = Record<string, unknown> & { __type: string };

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

function hashtagSuffix(hashtags: string[]): string {
  const tags = hashtags
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  return tags.length > 0 ? `\n\n${tags.join(' ')}` : '';
}

function postContent(post: ScheduledPost): string {
  return `${post.caption.trim()}${hashtagSuffix(post.hashtags)}`.trim();
}

function filenameForDataUrl(dataUrl: string, index: number): string {
  const match = /^data:([^;,]+)/i.exec(dataUrl);
  const mime = match?.[1] ?? 'image/png';
  const ext = mime.split('/')[1]?.replace(/[^a-z0-9]+/gi, '') || 'png';
  return `aether-${index + 1}.${ext}`;
}

function blobFromDataUrl(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(',');
  if (!meta || !payload || !meta.startsWith('data:')) {
    throw new PublisherError('invalid data URL media', PROVIDER_ID);
  }
  const mime = /^data:([^;,]+)/i.exec(meta)?.[1] ?? 'application/octet-stream';
  const bytes = Buffer.from(payload, 'base64');
  return new Blob([bytes], { type: mime });
}

function integrationEnvKey(platform: PublishPlatform): string {
  return `POSTIZ_INTEGRATION_${platform.toUpperCase().replace(/-/g, '_')}`;
}

export function postizIntegrationIdsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Partial<Record<PublishPlatform, string>> {
  const ids: Partial<Record<PublishPlatform, string>> = {};
  for (const platform of [
    'instagram',
    'tiktok',
    'x',
    'linkedin',
    'youtube-shorts',
    'pinterest',
  ] as const) {
    const value = env[integrationEnvKey(platform)]?.trim();
    if (value) ids[platform] = value;
  }
  return ids;
}

export function createPostizPublisherFromEnv(
  opts: Omit<PostizPublisherOptions, 'apiKey' | 'apiBaseUrl' | 'integrationIds'>,
  env: NodeJS.ProcessEnv = process.env
): PublisherProvider | null {
  const apiKey = env.POSTIZ_API_KEY?.trim();
  if (!apiKey) return null;
  const integrationIds = postizIntegrationIdsFromEnv(env);
  if (Object.keys(integrationIds).length === 0) return null;
  return createPostizPublisher({
    ...opts,
    apiKey,
    apiBaseUrl: env.POSTIZ_API_URL,
    integrationIds,
    pinterestBoardId: env.POSTIZ_PINTEREST_BOARD_ID,
    pinterestLinkUrl: env.POSTIZ_PINTEREST_LINK_URL,
  });
}

function settingsForPost(
  post: ScheduledPost,
  opts: Pick<PostizPublisherOptions, 'pinterestBoardId' | 'pinterestLinkUrl'>
): PostizSettings {
  switch (post.platform) {
    case 'instagram':
      return {
        __type: 'instagram',
        post_type: 'post',
        is_trial_reel: false,
        collaborators: [],
      };
    case 'tiktok':
      return {
        __type: 'tiktok',
        title: post.caption.slice(0, 90),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        duet: false,
        stitch: false,
        comment: true,
        autoAddMusic: 'no',
        brand_content_toggle: false,
        brand_organic_toggle: false,
        video_made_with_ai: true,
        content_posting_method: 'DIRECT_POST',
      };
    case 'x':
      return {
        __type: 'x',
        who_can_reply_post: 'everyone',
        community: '',
        made_with_ai: true,
        paid_partnership: false,
      };
    case 'linkedin':
      return { __type: 'linkedin', post_as_images_carousel: false };
    case 'youtube-shorts':
      return {
        __type: 'youtube',
        title: post.caption.trim().slice(0, 100) || 'Aether render',
        type: 'public',
        selfDeclaredMadeForKids: 'no',
        tags: post.hashtags.map((tag) => ({ value: tag, label: tag })),
      };
    case 'pinterest':
      if (!opts.pinterestBoardId) {
        throw new PublisherUnavailableError(
          PROVIDER_ID,
          'POSTIZ_PINTEREST_BOARD_ID missing'
        );
      }
      return {
        __type: 'pinterest',
        board: opts.pinterestBoardId,
        title: post.caption.trim().slice(0, 100),
        link: opts.pinterestLinkUrl ?? '',
        dominant_color: '',
      };
    default:
      throw new PublisherError(
        `unsupported Postiz platform: ${post.platform}`,
        PROVIDER_ID
      );
  }
}

export function createPostizPublisher(
  opts: PostizPublisherOptions
): PublisherProvider {
  const { workspaceId } = opts;
  if (!workspaceId) {
    throw new PublisherError('workspaceId required', PROVIDER_ID);
  }
  if (!opts.apiKey) {
    throw new PublisherUnavailableError(PROVIDER_ID, 'POSTIZ_API_KEY missing');
  }
  const apiBaseUrl = normalizeBaseUrl(opts.apiBaseUrl);
  const fetchImpl = opts.fetch ?? fetch;

  function integrationId(platform: PublishPlatform): string | undefined {
    return opts.integrationIds[platform];
  }

  function buildPreviewUrl(postId: string): string {
    const path = `/workspace/${encodeURIComponent(workspaceId)}?publishPreview=${encodeURIComponent(postId)}`;
    if (!opts.baseUrl) return path;
    return `${opts.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: opts.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new PublisherError(
        `Postiz ${path} failed with HTTP ${res.status}`,
        PROVIDER_ID
      );
    }
    return (await res.json()) as T;
  }

  async function deleteRequest(path: string): Promise<void> {
    const res = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: opts.apiKey,
      },
    });
    if (!res.ok && res.status !== 404) {
      throw new PublisherError(
        `Postiz DELETE ${path} failed with HTTP ${res.status}`,
        PROVIDER_ID
      );
    }
  }

  async function uploadMedia(mediaUrl: string, index: number): Promise<PostizUpload> {
    if (/^https:\/\//i.test(mediaUrl)) {
      return postJson<PostizUpload>('/upload-from-url', { url: mediaUrl });
    }
    if (/^data:/i.test(mediaUrl)) {
      const blob = blobFromDataUrl(mediaUrl);
      const form = new FormData();
      form.append('file', blob, filenameForDataUrl(mediaUrl, index));
      const res = await fetchImpl(`${apiBaseUrl}/upload`, {
        method: 'POST',
        headers: { Authorization: opts.apiKey },
        body: form,
      });
      if (!res.ok) {
        throw new PublisherError(
          `Postiz /upload failed with HTTP ${res.status}`,
          PROVIDER_ID
        );
      }
      return (await res.json()) as PostizUpload;
    }
    throw new PublisherError(
      'Postiz media must be a public HTTPS URL or data URL',
      PROVIDER_ID
    );
  }

  return {
    id: PROVIDER_ID,

    canPublish(post) {
      if (post.platform === 'pinterest' && !opts.pinterestBoardId) return false;
      return Boolean(integrationId(post.platform));
    },

    async schedule(post): Promise<ScheduleResult> {
      const id = integrationId(post.platform);
      if (!id) {
        throw new PublisherUnavailableError(
          PROVIDER_ID,
          `${integrationEnvKey(post.platform)} missing`
        );
      }
      if (post.platform === 'pinterest' && !opts.pinterestBoardId) {
        throw new PublisherUnavailableError(
          PROVIDER_ID,
          'POSTIZ_PINTEREST_BOARD_ID missing'
        );
      }
      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new PublisherError('mediaUrls required', PROVIDER_ID);
      }

      const image = await Promise.all(post.mediaUrls.map(uploadMedia));
      const response = await postJson<PostizCreateResponse[]>('/posts', {
        type: 'schedule',
        date: post.scheduledAt,
        shortLink: false,
        tags: [],
        posts: [
          {
            integration: { id },
            value: [{ content: postContent(post), image }],
            settings: settingsForPost(post, opts),
          },
        ],
      });
      const externalId = response[0]?.postId ?? response[0]?.id;
      let previewId = post.id;
      if (opts.storage) {
        const inserted = await opts.storage.insert(workspaceId, {
          ...post,
          provider: PROVIDER_ID,
          externalId,
        });
        previewId = inserted.id;
      }
      return {
        previewUrl: buildPreviewUrl(previewId || externalId || 'postiz'),
        externalId,
      };
    },

    async list(wsId) {
      return opts.storage?.list(wsId) ?? [];
    },

    async cancel(id) {
      // Cancel externally on Postiz first — the local storage row only
      // controls our preview overlay; the actual scheduled post lives on
      // Postiz. If the external delete fails, throw so creators see the
      // failure rather than silently believing the post was cancelled.
      // 404 is treated as already-gone (idempotent cancel).
      await deleteRequest(`/posts/${encodeURIComponent(id)}`);
      await opts.storage?.cancel(id);
    },
  };
}
