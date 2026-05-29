import type { ResolvedShareLink } from './store';

const CRAWLER_RE =
  /(bot|crawler|spider|twitterbot|facebookexternalhit|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|embedly|quora link preview|skypeuripreview|pinterest)/i;

export function isSocialCrawler(request: Request): boolean {
  return CRAWLER_RE.test(request.headers.get('user-agent') ?? '');
}

export function isEnrichmentProbe(request: Request): boolean {
  return (
    request.headers.get('x-aether-enrichment') === '1' ||
    /aether-share-enrichment/i.test(request.headers.get('user-agent') ?? '')
  );
}

export function sharePreviewHtml(input: {
  resolved: ResolvedShareLink;
  shortUrl: string;
}): string {
  const { target } = input.resolved;
  const title = escapeHtml(target.title);
  const description = escapeHtml(target.description ?? 'Open this aether vibes page.');
  const canonicalUrl = escapeHtml(target.canonicalUrl);
  const shortUrl = escapeHtml(input.shortUrl);
  const image = target.imageUrl ? escapeHtml(target.imageUrl) : undefined;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="canonical" href="${canonicalUrl}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${shortUrl}" />
${image ? `<meta property="og:image" content="${image}" />` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
${image ? `<meta name="twitter:image" content="${image}" />` : ''}
</head>
<body>
<p><a href="${canonicalUrl}">${title}</a></p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
