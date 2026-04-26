import {
  PublisherError,
  PublisherUnavailableError,
  type PublishPlatform,
  type PublisherProvider,
  type ScheduledPost,
  type ScheduleResult,
} from './types';

const PROVIDER_ID = 'social-auto-upload' as const;
const DEFAULT_TIMEOUT_MS = 30_000;

type SidecarPlatform =
  | 'tiktok'
  | 'douyin'
  | 'xiaohongshu'
  | 'bilibili'
  | 'kuaishou';

type SidecarPost = {
  id?: string;
  platform?: SidecarPlatform | PublishPlatform;
  accountId?: string;
  mediaUrls?: string[];
  caption?: string;
  hashtags?: string[];
  scheduledAt?: string;
  status?: string;
};

type SidecarListResponse =
  | SidecarPost[]
  | {
      posts?: SidecarPost[];
    };

export interface SocialAutoUploadPublisherOptions {
  workspaceId: string;
  endpoint?: string;
  token?: string;
  timeoutMs?: number;
}

const PLATFORM_TO_SIDECAR: Partial<Record<PublishPlatform, SidecarPlatform>> = {
  tiktok: 'tiktok',
  douyin: 'douyin',
  xhs: 'xiaohongshu',
  bilibili: 'bilibili',
  kuaishou: 'kuaishou',
};

const SIDECAR_TO_PLATFORM: Record<SidecarPlatform, PublishPlatform> = {
  tiktok: 'tiktok',
  douyin: 'douyin',
  xiaohongshu: 'xhs',
  bilibili: 'bilibili',
  kuaishou: 'kuaishou',
};

export function isSocialAutoUploadPublisherConfigured(env = process.env): boolean {
  return Boolean(env.SOCIAL_AUTO_UPLOAD_URL && env.SOCIAL_AUTO_UPLOAD_TOKEN);
}

export function createSocialAutoUploadPublisher(
  opts: SocialAutoUploadPublisherOptions
): PublisherProvider {
  const endpoint = stripTrailingSlash(
    opts.endpoint ?? process.env.SOCIAL_AUTO_UPLOAD_URL
  );
  const token = opts.token ?? process.env.SOCIAL_AUTO_UPLOAD_TOKEN;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function ensureAvailable() {
    if (!endpoint) {
      throw new PublisherUnavailableError(
        PROVIDER_ID,
        'SOCIAL_AUTO_UPLOAD_URL not set'
      );
    }
    if (!token) {
      throw new PublisherUnavailableError(
        PROVIDER_ID,
        'SOCIAL_AUTO_UPLOAD_TOKEN not set'
      );
    }
  }

  async function request(path: string, init: RequestInit): Promise<Response> {
    ensureAvailable();
    const res = await fetchWithTimeout(
      `${endpoint}${path}`,
      {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      timeoutMs
    );
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new PublisherError(`${res.status} ${text}`, PROVIDER_ID);
    }
    return res;
  }

  async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const res = await request(path, init);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    id: PROVIDER_ID,

    canPublish(post) {
      return Boolean(PLATFORM_TO_SIDECAR[post.platform] && endpoint && token);
    },

    async schedule(post): Promise<ScheduleResult> {
      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new PublisherError('mediaUrls required', PROVIDER_ID);
      }
      const platform = PLATFORM_TO_SIDECAR[post.platform];
      if (!platform) {
        throw new PublisherError(
          `unsupported platform: ${post.platform}`,
          PROVIDER_ID
        );
      }
      const payload = {
        workspaceId: opts.workspaceId,
        platform,
        accountId: post.accountId,
        mediaUrls: post.mediaUrls,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduledAt: post.scheduledAt,
        screenshotOnFailure: true,
      };
      const data = await requestJson<{ id?: string }>('/v1/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const externalId = data.id;
      return {
        externalId,
        previewUrl: externalId
          ? `${endpoint}/jobs/${encodeURIComponent(externalId)}`
          : `${endpoint}/jobs`,
      };
    },

    async list(workspaceId) {
      const query = new URLSearchParams({ workspaceId }).toString();
      const data = await requestJson<SidecarListResponse>(`/v1/posts?${query}`, {
        method: 'GET',
      });
      const rows = Array.isArray(data) ? data : data.posts ?? [];
      return rows.map(mapSidecarPost).filter((row): row is ScheduledPost => !!row);
    },

    async cancel(id) {
      await request(`/v1/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

function mapSidecarPost(raw: SidecarPost): ScheduledPost | null {
  if (!raw.id || !raw.platform) return null;
  const platform =
    raw.platform === 'xiaohongshu'
      ? SIDECAR_TO_PLATFORM.xiaohongshu
      : SIDECAR_TO_PLATFORM[raw.platform as SidecarPlatform] ??
        (raw.platform as PublishPlatform);
  if (!PLATFORM_TO_SIDECAR[platform]) return null;

  return {
    id: raw.id,
    platform,
    mediaUrls: raw.mediaUrls ?? [],
    caption: raw.caption ?? '',
    hashtags: raw.hashtags ?? [],
    scheduledAt: raw.scheduledAt ?? new Date(0).toISOString(),
    accountId: raw.accountId,
  };
}

function stripTrailingSlash(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/, '');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
