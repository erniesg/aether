import type { ReferenceRecord } from '@/lib/providers/reference/types';

export type WorkspaceMode = 'venture' | 'studio';

export type KnowledgeSourceKind = 'url' | 'repo' | 'upload' | 'asset';

export interface KnowledgeSource {
  id: string;
  kind: KnowledgeSourceKind;
  label: string;
  note: string;
}

export interface BrandContext {
  id: string;
  name: string;
  palette: string[];
  type: string[];
  voice: string;
  knowledgeSources: KnowledgeSource[];
}

export interface OfferContext {
  id: string;
  name: string;
  summary: string;
  claims: string[];
  heroAsset: string;
  heroAssetReferenceId?: string;
}

export interface CampaignContext {
  id: string;
  name: string;
  goal: string;
  audience: string;
  channels: string[];
  cta: string;
}

export interface SignalContext {
  id: string;
  title: string;
  platform: string;
  lift: string;
}

export interface InputSetDraft {
  id: string;
  referenceCount: number;
  signalIds: string[];
  referenceIds?: string[];
  constraints: string[];
}

export interface CreatorContextModel {
  workspaceMode: WorkspaceMode;
  workspaceLabel: string;
  brand: BrandContext;
  offer: OfferContext;
  campaign: CampaignContext;
  signals: SignalContext[];
  inputSet: InputSetDraft;
}

export interface ProductPromptScope {
  id?: string;
  canonicalName?: string;
}

export function describeWorkspaceMode(mode: WorkspaceMode): string {
  return mode === 'venture' ? 'creator-owned venture' : 'multi-brand studio';
}

export function summarizeInputSet(context: CreatorContextModel): string {
  return [
    'brand',
    'offer',
    'campaign',
    `${context.inputSet.referenceCount} refs`,
    `${context.inputSet.signalIds.length} signals`,
  ].join(' + ');
}

export function countCreatorInputs(
  context: CreatorContextModel,
  references: ReadonlyArray<ReferenceRecord>
): number {
  const stableContextCount = 3; // brand + offer + campaign
  return stableContextCount + context.inputSet.signalIds.length + references.length;
}

export function visualReferenceUrls(
  references: ReadonlyArray<ReferenceRecord>,
  max = 6
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const ref of references) {
    if (ref.kind !== 'image' && ref.kind !== 'video') continue;
    const url = ref.previewUrl.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

export function mergeReferenceUrls(
  ...groups: Array<ReadonlyArray<string> | undefined>
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const raw of group ?? []) {
      const url = raw.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

function normalizeReferenceText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function referenceMatchesProductScope(
  ref: ReferenceRecord,
  product?: ProductPromptScope
): boolean {
  if (!product?.id && !product?.canonicalName) return true;
  if (ref.referenceStatus === 'rejected') return false;
  if (product.id && ref.productId) return ref.productId === product.id;
  if (product.canonicalName && ref.productCanonicalName) {
    return (
      normalizeReferenceText(ref.productCanonicalName) ===
      normalizeReferenceText(product.canonicalName)
    );
  }
  if (!product.canonicalName) return false;
  const haystack = normalizeReferenceText(
    [
      ref.title,
      ref.usageIntent,
      ref.notes,
      ref.productCanonicalName,
      ...(ref.tags ?? []),
      ref.attribution.source,
      ref.attribution.author,
      ref.attribution.url,
      ref.fullUrl,
      ref.previewUrl,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ')
  );
  const tokens = normalizeReferenceText(product.canonicalName)
    .split(' ')
    .filter((token) => token.length > 2);
  if (tokens.length === 0) return false;
  const matched = tokens.filter((token) => haystack.includes(token));
  return matched.length / tokens.length >= 0.75;
}

export function filterReferencesForProductScope(
  references: ReadonlyArray<ReferenceRecord>,
  product?: ProductPromptScope
): ReferenceRecord[] {
  if (!product?.id && !product?.canonicalName) return [...references];
  return references.filter((ref) => referenceMatchesProductScope(ref, product));
}

export function buildCreatorGenerationPrompt(
  context: CreatorContextModel,
  creatorPrompt: string,
  references: ReadonlyArray<ReferenceRecord>,
  options: { product?: ProductPromptScope } = {}
): string {
  const scopedReferences = filterReferencesForProductScope(
    references,
    options.product
  );
  const refSummary = scopedReferences
    .slice(0, 6)
    .map((ref) => {
      const author = ref.attribution.author ? ` by ${ref.attribution.author}` : '';
      const kind = ref.kind === 'embed' ? 'link' : ref.kind;
      const title = ref.title ? `${ref.title}; ` : '';
      const intent = ref.usageIntent ? `; intent ${ref.usageIntent}` : '';
      const tags = ref.tags && ref.tags.length > 0 ? `; tags ${ref.tags.join(', ')}` : '';
      const notes = ref.notes ? `; notes ${ref.notes}` : '';
      return `${title}${ref.attribution.source}${author} (${kind}${intent}${tags}${notes})`;
    })
    .join(', ');

  const lines = [
    `Creator request: ${creatorPrompt.trim()}`,
    `Brand: ${context.brand.name}; palette ${context.brand.palette.join(', ')}; type ${context.brand.type.join(', ')}; voice ${context.brand.voice}`,
    `Offer: ${context.offer.name}; ${context.offer.summary}; claims ${context.offer.claims.join(', ')}; hero asset ${context.offer.heroAsset}.`,
    `Campaign: ${context.campaign.name}; goal ${context.campaign.goal}; audience ${context.campaign.audience}; CTA ${context.campaign.cta}.`,
    `Signals: ${context.signals
      .filter((signal) => context.inputSet.signalIds.includes(signal.id))
      .map((signal) => signal.title)
      .join(', ')}.`,
    `Constraints: ${context.inputSet.constraints.join(', ')}.`,
  ];

  if (refSummary) {
    lines.push(`Pinned references: ${scopedReferences.length} source${scopedReferences.length === 1 ? '' : 's'}; ${refSummary}.`);
  }

  // Identity anchor cue — only emitted when reference images are present.
  // Without this, gpt-image-2 treats `image[]` refs as style/composition
  // hints and frequently substitutes generic faces. With it, the model
  // is explicitly told to preserve people / brands from the refs unless
  // the creator's prompt overrides. The auto-mode lap's per-format
  // hero-anchor cue is stronger ("PRESERVE EXACTLY"); this is the
  // composer-direct equivalent so drag-drop generations don't drift
  // off-identity by default. Bug fix 2026-04-27 — was empty before.
  if (scopedReferences.length > 0) {
    lines.push(
      'Use selected references when relevant. Keep raster free of baked text so editable overlays carry copy. Preserve brand/product identity and the referenced scene/subjects unless the creator asks otherwise.'
    );
  }

  return lines.join('\n');
}

/**
 * EMPTY_CREATOR_CONTEXT — zero-filled shell used as the server-render default
 * so the workspace opens with genuinely blank state rather than flashing the
 * DEMO placeholder data before Convex resolves.
 *
 * Rule: coerce helpers in creator-store must return null (not EMPTY) for absent
 * Convex data. The UI then checks `name === ''` or `id === ''` to decide whether
 * to render the section header vs. an empty-state prompt.
 */
export const EMPTY_CREATOR_CONTEXT: CreatorContextModel = {
  workspaceMode: 'venture',
  workspaceLabel: '',
  brand: {
    id: '',
    name: '',
    palette: [],
    type: [],
    voice: '',
    knowledgeSources: [],
  },
  offer: {
    id: '',
    name: '',
    summary: '',
    claims: [],
    heroAsset: '',
  },
  campaign: {
    id: '',
    name: '',
    goal: '',
    audience: '',
    channels: [],
    cta: '',
  },
  signals: [],
  inputSet: {
    id: '',
    referenceCount: 0,
    signalIds: [],
    constraints: [],
  },
};

export const DEMO_CREATOR_CONTEXT: CreatorContextModel = {
  workspaceMode: 'venture',
  workspaceLabel: 'Solstice Collective',
  brand: {
    id: 'brand-solstice-skin',
    name: 'Solstice Skin',
    palette: ['#0F1013', '#E8E4D6', '#C48B5E', '#7C9885', '#2E4057'],
    type: ['Editorial serif', 'Mono caption'],
    voice: 'slow, certain, more gesture than grammar.',
    knowledgeSources: [
      {
        id: 'brand-site',
        kind: 'url',
        label: 'solsticeskin.com',
        note: 'brand site',
      },
      {
        id: 'launch-repo',
        kind: 'repo',
        label: 'solstice-launch-kit',
        note: 'repo',
      },
      {
        id: 'founder-brief',
        kind: 'upload',
        label: 'founder-brief.pdf',
        note: 'uploaded docs',
      },
      {
        id: 'hero-assets',
        kind: 'asset',
        label: 'spring-packshots',
        note: 'assets',
      },
    ],
  },
  offer: {
    id: 'offer-spring-reset-duo',
    name: 'Spring Reset Duo',
    summary: 'barrier repair + golden-hour glow',
    claims: ['ceramide cleanse', 'niacinamide glow', 'fragrance-free'],
    heroAsset: 'amber bottle pair',
  },
  campaign: {
    id: 'campaign-slow-morning-drop',
    name: 'Slow Morning Drop',
    goal: 'Launch the spring skincare line with a slow-morning, golden-hour mood.',
    audience: 'skin-care-first shoppers discovering the drop on Instagram and TikTok',
    channels: ['IG post', 'story', 'reel cover'],
    cta: 'shop the drop',
  },
  signals: [
    { id: 'clean-girl', title: 'Clean-girl aesthetic', platform: 'TikTok EU', lift: '+341%' },
    { id: 'golden-hour', title: 'Golden-hour product', platform: 'Instagram', lift: '+124%' },
    {
      id: 'slow-morning',
      title: 'Slow-morning rituals',
      platform: 'Pinterest',
      lift: '+89%',
    },
  ],
  inputSet: {
    id: 'input-set-slow-morning-01',
    referenceCount: 2,
    signalIds: ['golden-hour', 'slow-morning'],
    constraints: ['golden-hour', 'clean counter', 'pack-first framing'],
  },
};
