import { median } from './account-analysis';

export interface PresencePostMetric {
  profileId: string;
  postUrl: string;
  capturedAt: string;
  likes: number;
  reposts: number;
  replies: number;
  impressions?: number;
  pillar?: string;
}

export interface PostedDraftPermalink {
  profileId?: string;
  receiptUrl?: string;
  pillar: string;
}

export interface PresenceLedgerLine {
  pillar: string;
  posts: number;
  medianEngagement: number;
}

export function joinMetricsToPostedDrafts(
  metrics: PresencePostMetric[],
  drafts: PostedDraftPermalink[]
): PresencePostMetric[] {
  const pillarByUrl = new Map<string, string>();
  for (const draft of drafts) {
    const key = draft.receiptUrl ? xPostUrlKey(draft.receiptUrl) : '';
    if (!key || !draft.pillar.trim()) continue;
    pillarByUrl.set(key, draft.pillar.trim());
  }
  return metrics.map((metric) => ({
    ...metric,
    pillar: pillarByUrl.get(xPostUrlKey(metric.postUrl)) ?? 'untagged',
  }));
}

export function buildPresenceLedgerRollup(
  metrics: PresencePostMetric[]
): PresenceLedgerLine[] {
  const groups = new Map<string, PresencePostMetric[]>();
  for (const metric of metrics) {
    const pillar = metric.pillar?.trim() || 'untagged';
    groups.set(pillar, [...(groups.get(pillar) ?? []), metric]);
  }
  return [...groups.entries()]
    .map(([pillar, rows]) => ({
      pillar,
      posts: rows.length,
      medianEngagement: median(rows.map(presenceEngagementScore)),
    }))
    .sort((a, b) => {
      const engagementDelta = b.medianEngagement - a.medianEngagement;
      if (engagementDelta !== 0) return engagementDelta;
      const postsDelta = b.posts - a.posts;
      if (postsDelta !== 0) return postsDelta;
      return a.pillar.localeCompare(b.pillar);
    });
}

export function presenceEngagementScore(metric: PresencePostMetric): number {
  return metric.likes + metric.reposts + metric.replies;
}

export function xPostUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/^([^/]+)\/status(?:es)?\/([^/]+).*$/i, '$1/status/$2');
    return `x.com/${path}`.toLowerCase();
  } catch {
    return url
      .trim()
      .replace(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i, 'x.com/')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
}
