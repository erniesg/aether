import type { DeckArtifact, DeckBlock, DeckSlide } from '../types';

function copy(id: string, title: string, body: string, items?: string[]): DeckBlock {
  return { id, kind: 'copy', title, body, items };
}

function slide(
  id: string,
  title: string,
  section: DeckSlide['section'],
  layout: DeckSlide['layout'],
  blocks: DeckBlock[],
  speakerNotes: string,
  extras: Partial<DeckSlide> = {}
): DeckSlide {
  return { id, title, section, layout, blocks, speakerNotes, ...extras };
}

const PAILLETTE_PRODUCT_URL = 'https://paillette-stg.berlayar.ai/ngs/search';
const PAILLETTE_REPOSITORY_URL = 'https://github.com/erniesg/paillette';
const CHUNG_CHENG_ARTWORK = {
  title: 'Zhong Zheng Ren (中正人)',
  artist: 'Yeo Hwee Bin',
  year: 1969,
  imageUrl: 'https://www.nationalgallery.sg/content/dam/national-collections-artworks/national-collection/yeo-hwee-bin/2019/2019-00754_cropped.tif/_jcr_content/renditions/cq5dam.zoom.2048.2048.jpeg',
  sourceUrl: 'https://www.roots.gov.sg/Collection-Landing/listing/1454646',
  accessionNumber: '2019-00754',
  medium: 'Stone',
  dimensions: '251 × 90 × 52 cm',
  institution: 'National Gallery Singapore',
} as const;

const CHUNG_CHENG_QUERY =
  'Zhong Zheng Ren 中正人 Yeo Hwee Bin Chung Cheng High School sculpture';

const CHUNG_CHENG_RESULT = {
  id: CHUNG_CHENG_ARTWORK.accessionNumber,
  title: CHUNG_CHENG_ARTWORK.title,
  artist: CHUNG_CHENG_ARTWORK.artist,
  year: CHUNG_CHENG_ARTWORK.year,
  imageUrl: CHUNG_CHENG_ARTWORK.imageUrl,
  metadata: {
    accessionNumber: CHUNG_CHENG_ARTWORK.accessionNumber,
    medium: CHUNG_CHENG_ARTWORK.medium,
    sourceUrl: CHUNG_CHENG_ARTWORK.sourceUrl,
    sourceInstitution: CHUNG_CHENG_ARTWORK.institution,
  },
};

const slides: DeckSlide[] = [
  slide(
    'problem',
    'Art should be searchable by more than words',
    'intro',
    'title',
    [copy('problem-copy', 'Search understands words better than taste', 'Teams can describe a product precisely and still miss the image, color, and provenance that made it useful.')],
    'Open with the mismatch between how people remember products and how conventional search asks them to retrieve them.'
  ),
  slide(
    'solution',
    'Paillette searches text, images, colour, and metadata',
    'intro',
    'split-proof',
    [
      copy('solution-copy', 'One retrieval surface', 'Text, image, and color cues converge into ranked product results.', ['Hybrid retrieval', 'Public source provenance', 'API access']),
      {
        id: 'solution-product',
        kind: 'product-frame',
        title: 'Paillette · NGS search',
        productUrl: PAILLETTE_PRODUCT_URL,
        artwork: CHUNG_CHENG_ARTWORK,
      },
    ],
    'Introduce the product as a retrieval system, not another gallery.',
    { fragments: [{ id: 'solution-proof', order: 1, targetBlockId: 'solution-product' }] }
  ),
  slide(
    'architecture',
    'A small system keeps retrieval legible',
    'intro',
    'diagram',
    [copy('architecture-flow', 'Sources → embeddings → ranking → evidence', 'Public catalog records and images become searchable vectors; ranking returns the source trail with every result.', ['Ingest', 'Text + image embeddings', 'Hybrid rank', 'Provenance response'])],
    'Walk left to right and keep the architecture anchored to what a creator experiences.'
  ),
  slide(
    'product-search',
    'Search across text, image & colour',
    'live-demo',
    'live-demo',
    [
      {
        id: 'product-frame-search',
        kind: 'product-frame',
        title: 'Paillette · NGS search',
        productUrl: PAILLETTE_PRODUCT_URL,
        artwork: CHUNG_CHENG_ARTWORK,
      },
      {
        id: 'api-product-search',
        kind: 'api-call',
        title: 'Public text search',
        endpointId: 'product-search',
        authMode: 'public',
        requestBody: { query: CHUNG_CHENG_QUERY, topK: 10, minScore: 0.2 },
        mockResponse: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } },
      },
      { id: 'code-product-search', kind: 'code-reference', title: 'Code', codeReferenceIds: ['search-route', 'hybrid-ranker'] },
    ],
    'Use Product, API, and Code focus targets to show one verified public artwork at three levels.',
    {
      presenterLabel: 'Demo · product search',
      fragments: [
        { id: 'show-api', order: 1, targetBlockId: 'api-product-search' },
        { id: 'show-code', order: 2, targetBlockId: 'code-product-search' },
      ],
      hotspots: [
        { id: 'focus-api', label: 'API', targetSlideId: 'product-search', targetBlockId: 'api-product-search' },
        { id: 'compare-editorial', label: 'Editorial variant', targetSlideId: 'product-search-editorial' },
        { id: 'next-text-api', label: 'Text API', targetSlideId: 'text-search-api' },
      ],
    }
  ),
  slide(
    'product-search-editorial',
    'One artwork, three layers of proof',
    'live-demo',
    'live-demo',
    [
      {
        id: 'product-frame-search-editorial',
        kind: 'product-frame',
        title: 'Paillette · NGS search',
        productUrl: PAILLETTE_PRODUCT_URL,
        artwork: CHUNG_CHENG_ARTWORK,
      },
      {
        id: 'api-product-search-editorial',
        kind: 'api-call',
        title: 'Public text search',
        endpointId: 'product-search',
        authMode: 'public',
        requestBody: { query: CHUNG_CHENG_QUERY, topK: 10, minScore: 0.2 },
        mockResponse: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } },
      },
      { id: 'code-product-search-editorial', kind: 'code-reference', title: 'Code', codeReferenceIds: ['search-route', 'hybrid-ranker'] },
    ],
    'Use this alternate composition when the audience needs a quieter, editorial comparison of the same three proof layers.',
    {
      visualVariant: 'editorial-evidence',
      presenterLabel: 'Variant · editorial evidence',
      fragments: [
        { id: 'editorial-show-api', order: 1, targetBlockId: 'api-product-search-editorial' },
        { id: 'editorial-show-code', order: 2, targetBlockId: 'code-product-search-editorial' },
      ],
    }
  ),
  slide(
    'text-search-api',
    'The public text route returns source-labelled artwork records',
    'live-demo',
    'live-demo',
    [
      {
        id: 'api-text-search',
        kind: 'api-call',
        title: 'Public text search',
        endpointId: 'text-search',
        authMode: 'public',
        requestBody: { query: 'batik textile pattern', topK: 8, minScore: 0.2 },
        mockResponse: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } },
      },
      { id: 'code-text-search', kind: 'code-reference', codeReferenceIds: ['search-route', 'hybrid-ranker'] },
    ],
    'Edit the JSON query, run the allowlisted request, and disclose raw JSON only if the audience asks.',
    { presenterLabel: 'Demo · text search API' }
  ),
  slide(
    'image-search-api',
    'Search visually from an uploaded image',
    'live-demo',
    'live-demo',
    [
      {
        id: 'api-image-search',
        kind: 'api-call',
        title: 'Public image search',
        endpointId: 'image-search',
        authMode: 'public',
        requestMode: 'image',
        mockResponse: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } },
      },
      { id: 'code-image-search', kind: 'code-reference', codeReferenceIds: ['image-embedding', 'hybrid-ranker'] },
    ],
    'Choose an audience-safe image, run the public multipart request, and compare the returned source-labelled results.',
    { presenterLabel: 'Demo · image search API' }
  ),
  slide(
    'api-access',
    'Public discovery; signed-in keys when needed',
    'live-demo',
    'live-demo',
    [
      { id: 'api-usage-call', kind: 'api-call', title: 'API access', endpointId: 'list-sources', endpointIds: ['list-sources', 'api-keys', 'api-usage'], authMode: 'public', mockResponse: { success: true, data: [] } },
      { id: 'api-access-code', kind: 'code-reference', codeReferenceIds: ['auth-middleware', 'api-key-model'] },
    ],
    'Run the public source list first, then show how key and usage reads become available only through the existing signed-in or presenter-provided auth paths.',
    { presenterLabel: 'Demo · API access' }
  ),
  slide(
    'hybrid-retrieval',
    'Hybrid retrieval balances meaning with visible similarity',
    'deep-dive',
    'diagram',
    [copy('hybrid-copy', 'The rank is composed, not mysterious', 'Semantic candidates, visual neighbors, and lightweight product filters are scored together.', ['Text similarity', 'Image similarity', 'Product filters', 'Ranked evidence'])],
    'Connect each score back to the response fields already shown in the demos.',
    { branchTargets: ['text-search-api', 'image-search-api'] }
  ),
  slide(
    'color-image-search',
    'Color cues give visual search a controllable handle',
    'deep-dive',
    'split-proof',
    [copy('color-copy', 'A visual query can be adjusted without rewriting it', 'Dominant-color cues complement the image embedding when palette matters.'), { id: 'color-code', kind: 'code-reference', codeReferenceIds: ['image-embedding'] }],
    'Show color as one interpretable input, not a replacement for image similarity.'
  ),
  slide(
    'public-provenance',
    'Every result stays attached to its public source',
    'deep-dive',
    'split-proof',
    [copy('provenance-copy', 'Evidence travels with the result', 'Source URLs and retrieval metadata make ranking reviewable and shareable.'), { id: 'provenance-code', kind: 'code-reference', codeReferenceIds: ['provenance-model'] }],
    'Emphasize that provenance is part of the result contract, not an afterthought.'
  ),
  slide(
    'auth-model',
    'Auth separates public discovery from account operations',
    'deep-dive',
    'diagram',
    [copy('auth-copy', 'The browser never receives a vendor secret', 'Public search uses a constrained proxy; signed-in calls use the existing session; presenters may supply a credential that is never persisted or exported.', ['Public proxy', 'Logto session', 'Persistent Paillette key', 'No browser-side vendor secret'])],
    'Clarify that presenter-provided credentials live only in memory for the request.'
  ),
  slide(
    'performance',
    'Response metadata makes scaling claims testable',
    'deep-dive',
    'metric-strip',
    [
      { id: 'performance-metrics', kind: 'metrics', title: 'Session proof', items: ['duration', 'result count', 'cache', 'rate limit', 'server timing'] },
      copy('performance-copy', 'Measure the live call in front of the audience', 'The deck reports observed request metadata and keeps broader load claims out of the fixture.'),
    ],
    'Use the current session values; do not generalize a single response into a production benchmark.'
  ),
  slide(
    'ready-next',
    'The retrieval core is ready; sharing controls come next',
    'closing',
    'section',
    [copy('ready-copy', 'Ready now', 'Text, image, and product search with public provenance and existing auth.', ['Live product search', 'Allowlisted APIs', 'Code references']), copy('next-copy', 'Next', 'Ephemeral demo tokens, production sharing, and broader performance validation.')],
    'Separate what this fixture proves today from the Paillette-side work intentionally left for later.'
  ),
  slide(
    'closing',
    'Explore the product, API docs, and repository',
    'closing',
    'closing',
    [{ id: 'closing-links', kind: 'links', title: 'Continue from the evidence', items: [`Product · ${PAILLETTE_PRODUCT_URL}`, 'API docs · https://paillette-stg.berlayar.ai/docs/api', `Repository · ${PAILLETTE_REPOSITORY_URL}`] }],
    'Close by inviting the audience to inspect the surface that matches their interest.'
  ),
];

export const PAILLETTE_SHARE_DECK: DeckArtifact = {
  id: 'paillette-share-deck',
  artifactKind: 'deck',
  title: 'Paillette · visual product discovery',
  stage: { width: 1920, height: 1080 },
  styleTokens: {
    background: '#0B0B0E',
    foreground: '#FFFFFF',
    accent: '#D946EF',
    muted: '#8B8D96',
    headingFont: 'Space Grotesk, Helvetica Neue, Helvetica, Arial, sans-serif',
    bodyFont: 'Space Grotesk, Helvetica Neue, Helvetica, Arial, sans-serif',
  },
  slides,
  drawerTabs: ['Product', 'API', 'Code'],
  liveDemo: {
    baseUrl: 'https://paillette-stg.berlayar.ai',
    endpoints: [
      { id: 'product-search', label: 'Product search', method: 'POST', path: '/api/public-search/ngs/text', authModes: ['public'], staticFallback: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } } },
      { id: 'text-search', label: 'Public text search', method: 'POST', path: '/api/public-search/ngs/text', authModes: ['public'], staticFallback: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } } },
      { id: 'image-search', label: 'Public image search', method: 'POST', path: '/api/public-search/ngs/image', authModes: ['public'], staticFallback: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } } },
      { id: 'browse', label: 'Public collection browse', method: 'GET', path: '/api/public-search/ngs/browse?limit=12&offset=0', authModes: ['public'], staticFallback: { success: true, data: { results: [CHUNG_CHENG_RESULT], count: 1 } } },
      { id: 'list-sources', label: 'List public sources', method: 'GET', path: '/api/docs/orgs', authModes: ['public'], staticFallback: { success: true, data: [{ id: 'ngs', name: 'National Gallery Singapore' }] } },
      { id: 'api-keys', label: 'Personal API keys', method: 'GET', path: 'https://paillette-api-stg.berlayar.ai/api/v1/me/api-keys', authModes: ['signed-in', 'presenter-provided'], staticFallback: { success: true, data: { keys: [] } } },
      { id: 'api-usage', label: 'Today’s API usage', method: 'GET', path: 'https://paillette-api-stg.berlayar.ai/api/v1/me/usage/today', authModes: ['signed-in', 'presenter-provided'], staticFallback: { success: true, data: { date: 'session date', used: 0, quota: 1000 } } },
    ],
  },
  codeReferences: [
    { id: 'search-route', filePath: 'apps/web/app/routes/api.public-search.$orgId.text.ts', label: 'Public text-search boundary', whyItMatters: 'Validates query, topK, minScore, and the supported artist facet.' },
    { id: 'hybrid-ranker', filePath: 'apps/api/src/routes/search.ts', label: 'Text and image search routes', whyItMatters: 'Returns ranked artwork results from the configured search providers.' },
    { id: 'image-embedding', filePath: 'apps/web/app/routes/api.public-search.$orgId.image.ts', label: 'Public image-search boundary', whyItMatters: 'Validates multipart images and keeps the 10 MB public limit explicit.' },
    { id: 'provenance-model', filePath: 'apps/web/app/components/artwork/source-indicator.tsx', label: 'Source indicator', whyItMatters: 'Keeps NGS, Roots, metadata, and generated-caption sources visible.' },
    { id: 'auth-middleware', filePath: 'apps/api/src/middleware/auth.ts', label: 'API authentication boundary', whyItMatters: 'Resolves Logto users and persistent API-key principals.' },
    { id: 'api-key-model', filePath: 'apps/api/src/routes/api-keys.ts', label: 'API key and daily usage routes', whyItMatters: 'Defines creation, revocation, and current-day quota reads.' },
  ],
  graphNodes: [
    { id: 'node-deck', kind: 'deck', ref: 'paillette-share-deck' },
    ...slides.map((item) => ({ id: `node-slide-${item.id}`, kind: 'slide' as const, parentId: 'node-deck', ref: item.id })),
    ...slides.flatMap((item) => item.blocks.map((block) => ({ id: `node-block-${block.id}`, kind: 'block' as const, parentId: `node-slide-${item.id}`, ref: block.id }))),
  ],
  provenance: [
    {
      id: 'provenance-fixture-plan',
      action: 'compose repo product deck fixture',
      sourceRefs: [
        { kind: 'repo', ref: PAILLETTE_REPOSITORY_URL },
        { kind: 'site', ref: PAILLETTE_PRODUCT_URL },
        { kind: 'reference', ref: 'frontend-slides:neo-grid-bold' },
        { kind: 'reference', ref: 'frontend-slides:editorial-evidence' },
        { kind: 'reference', ref: 'hyperframes:/slideshow' },
      ],
      inputs: ['public repo facts', 'public product surface', 'checked-in response evidence'],
      outputs: slides.map((item) => item.id),
      beforeSnapshotRef: null,
      afterSnapshotRef: 'deck:paillette-share-deck:v1',
      timestamp: 1783677600000,
    },
  ],
  handoffNotes: [
    'Graph-backed Aether deck remains the source of truth.',
    'Public product links and route shapes were verified against the Paillette README and source tree.',
    'Keep API requests allowlisted and preserve checked-in public evidence for offline review.',
  ],
  knownWarnings: [
    'Live responses can differ from the checked-in public artwork evidence.',
    'Presenter credentials remain session-only and are never persisted or exported.',
  ],
};
