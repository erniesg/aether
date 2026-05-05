import { resolveCommandLlmProvider } from '@/lib/providers/llm/registry';
import type { CommandLlmProviderId } from '@/lib/providers/llm/types';
import type { PublishPlatform } from '@/lib/providers/publisher/types';
import { SUPPORTED_LOCALES } from '@/lib/locale/registry';
import {
  DEFAULT_PRODUCT_CATALOG,
  normalizeForMatch,
  normalizeKnownProductText,
  resolveKnownProductMention,
  resolveProductMention,
  type ProductCatalogEntry,
  type ProductResearcher,
  type ProductResolution,
  type ProductCatalogSource,
} from '@/lib/product/catalog';

export type VoiceCommandAction = 'generate-socials' | 'generate' | 'unknown';
export type VoiceCommandPublishMode = 'review' | 'auto-post' | 'ask';
export type VoiceCommandScope = 'all' | 'single';
export type VoiceCommandSource = 'heuristic' | CommandLlmProviderId;
export type VoiceCommandPlannerStatus = 'llm' | 'heuristic-fallback';

export interface VoiceCommandPlannerMetadata {
  provider: VoiceCommandSource;
  model?: string;
  status: VoiceCommandPlannerStatus;
  requestedProvider?: CommandLlmProviderId;
  requestedModel?: string;
  attemptedProvider?: CommandLlmProviderId;
  attemptedModel?: string;
  error?: string;
}

export interface VoiceCommandFormat {
  id: string;
  label?: string;
  aspectRatio?: string;
}

export interface VoiceCommandContext {
  formats: VoiceCommandFormat[];
  locales: string[];
  languageMode: 'single' | 'multilingual';
  workspaceId?: string;
}

export interface VoiceCreatorCommand {
  action: VoiceCommandAction;
  transcript: string;
  brief: string;
  prompt: string;
  scope: VoiceCommandScope;
  referenceSearchQuery?: string;
  publishMode: VoiceCommandPublishMode;
  targetPlatforms?: PublishPlatform[];
  needsPublishClarification: boolean;
  confidence: number;
  source: VoiceCommandSource;
  commandPlanner?: VoiceCommandPlannerMetadata;
  product?: VoiceCommandProductMatch;
}

export interface VoiceCommandProductMatch {
  id: string;
  canonicalName: string;
  brand?: string;
  productName?: string;
  source: ProductCatalogSource;
  confidence: number;
  description?: string;
  officialUrl?: string;
  imageSearchQuery?: string;
  imageUrls?: string[];
}

export interface VoiceGenerationPlanContext extends VoiceCommandContext {
  referenceUrls?: string[];
  publishMode?: Exclude<VoiceCommandPublishMode, 'ask'>;
  targetPlatforms?: PublishPlatform[];
  heroCount?: number;
}

export interface VoiceGenerationPlan {
  prompt: string;
  options: {
    scope: VoiceCommandScope;
    renderMode: 'crop' | 'fanout' | 'hero-seeded-fanout';
    heroCount?: number;
    notifyMode: 'review' | 'auto-post';
    targetPlatforms?: PublishPlatform[];
    refs?: string[];
  };
  statusChips: Array<{ label: string; value: string }>;
}

const LEADING_VERBS =
  /^(?:please\s+)?(?:generate|make|create|draft|produce|build)\s+/i;
const SOCIAL_WORDS =
  /\b(?:socials?|social posts?|posts?|creative|assets?|ads?|campaign|variants?)\b/i;
const AUTO_POST_WORDS =
  /\b(?:auto[-\s]?publish|auto[-\s]?post|post now|publish now|publish(?:\s+it)?\s+automatically|schedule now|go live)\b/i;
const REVIEW_WORDS =
  /\b(?:hold for review|send for review|for review|approval|approve first|confirm first|ask me|draft only|do not publish|don't publish)\b/i;
const PUBLISH_WORDS = /\b(?:publish|post|schedule|go live)\b/i;
const SUPPORTED_LANGUAGE_WORDS =
  /\b(?:(?:all|all supported|supported|various|multiple|different)\s+languages?|(?:all|various|multiple|different)\s+(?:formats?|sizes?|dimensions?|targets?)(?:\s+and\s+(?:formats?|sizes?|dimensions?|targets?))*\s+and\s+languages?|languages?\s+(?:we\s+support|supported|available))\b/i;

const PUBLISH_PLATFORM_PATTERNS: ReadonlyArray<{
  platform: PublishPlatform;
  pattern: RegExp;
}> = [
  { platform: 'x', pattern: /\b(?:x|twitter)\b/i },
  { platform: 'linkedin', pattern: /\blinked\s?in\b/i },
  { platform: 'instagram', pattern: /\b(?:instagram|ig)\b/i },
  { platform: 'tiktok', pattern: /\btik\s?tok\b/i },
  { platform: 'pinterest', pattern: /\bpinterest\b/i },
  { platform: 'youtube-shorts', pattern: /\b(?:youtube\s+shorts?|yt\s+shorts?)\b/i },
  { platform: 'xhs', pattern: /\b(?:xhs|xiaohongshu|little\s+red\s+book)\b/i },
  { platform: 'douyin', pattern: /\bdouyin\b/i },
  { platform: 'bilibili', pattern: /\bbilibili\b/i },
  { platform: 'kuaishou', pattern: /\bkuaishou\b/i },
];

function trimCommandNoise(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\b(?:and|then)\s+(?:auto[-\s]?publish|auto[-\s]?post|post now|publish now|schedule now|go live|hold for review|send for review|for review|approval|approve first|confirm first|ask me|draft only|do not publish|don't publish|publish it|post it|schedule it)\b.*$/i, '')
    .replace(/\b(?:auto[-\s]?publish|auto[-\s]?post|post now|publish now|schedule now|go live|hold for review|send for review|for review|approval|approve first|confirm first|ask me|draft only|do not publish|don't publish|publish it|post it|schedule it)\b.*$/i, '')
    .replace(/\s*(?:and|plus|,)?\s*\b(?:for|across|on|in)\s+(?:all|various|multiple|different)\s+(?:platforms|formats|sizes|dimensions|languages)(?:\s+and\s+(?:platforms|formats|sizes|dimensions|languages))*\b/gi, ' ')
    .replace(/\s*(?:and|plus|,)?\s*\b(?:for|across|on)\s+all\s+(?:platforms|formats|sizes|dimensions)\b/gi, ' ')
    .replace(/\s*(?:and|plus|,)?\s*\b(?:in|for)\s+all\s+(?:supported\s+)?languages\b/gi, ' ')
    .replace(/\s*(?:and|plus|,)?\s*\b(?:for|across|on|in)\s+(?:various|multiple|different)\s+(?:platforms|formats|sizes|dimensions|languages)\b/gi, ' ')
    .replace(/\s*(?:and|plus|,)?\s*\b(?:various|multiple|different)\s+(?:platforms|formats|sizes|dimensions|languages)\b/gi, ' ')
    .replace(/\s*(?:and|plus|,)?\s*\bplatforms\b$/gi, ' ')
    .replace(/\s*(?:and|plus|,)?\s*\ball\s+supported\s+languages\b/gi, ' ')
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
}

function extractBrief(transcript: string): string {
  const cleaned = trimCommandNoise(transcript);
  const afterFor = cleaned.match(/\b(?:for|about)\s+(.+)$/i)?.[1];
  if (afterFor) return normalizeKnownProductText(trimCommandNoise(afterFor));
  return normalizeKnownProductText(trimCommandNoise(
    cleaned.replace(LEADING_VERBS, '').replace(SOCIAL_WORDS, '')
  ));
}

function resolvePublishMode(transcript: string): {
  publishMode: VoiceCommandPublishMode;
  needsPublishClarification: boolean;
} {
  if (AUTO_POST_WORDS.test(transcript)) {
    return { publishMode: 'auto-post', needsPublishClarification: false };
  }
  if (REVIEW_WORDS.test(transcript)) {
    return { publishMode: 'review', needsPublishClarification: false };
  }
  if (PUBLISH_WORDS.test(transcript)) {
    return { publishMode: 'ask', needsPublishClarification: true };
  }
  return { publishMode: 'review', needsPublishClarification: false };
}

function uniquePlatforms(platforms: PublishPlatform[]): PublishPlatform[] {
  return Array.from(new Set(platforms));
}

export function extractPublishTargetPlatforms(
  transcript: string
): PublishPlatform[] | undefined {
  const platforms = PUBLISH_PLATFORM_PATTERNS
    .filter(({ pattern }) => pattern.test(transcript))
    .map(({ platform }) => platform);
  const unique = uniquePlatforms(platforms);
  return unique.length > 0 ? unique : undefined;
}

function normalizePublishTargetPlatforms(value: unknown): PublishPlatform[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const platforms = value.filter((platform): platform is PublishPlatform =>
    typeof platform === 'string' &&
    PUBLISH_PLATFORM_PATTERNS.some((entry) => entry.platform === platform)
  );
  const unique = uniquePlatforms(platforms);
  return unique.length > 0 ? unique : undefined;
}

export function parseVoiceCommandHeuristically(
  transcript: string
): VoiceCreatorCommand {
  const cleaned = transcript.trim();
  const brief = extractBrief(cleaned);
  const isGeneration = LEADING_VERBS.test(cleaned) || cleaned.length > 0;
  const isSocial = SOCIAL_WORDS.test(cleaned);
  const action: VoiceCommandAction = !isGeneration
    ? 'unknown'
    : isSocial
      ? 'generate-socials'
      : 'generate';
  const scope: VoiceCommandScope = action === 'generate-socials' ? 'all' : 'single';
  const { publishMode, needsPublishClarification } = resolvePublishMode(cleaned);
  const targetPlatforms = extractPublishTargetPlatforms(cleaned);
  const prompt =
    action === 'generate-socials' && brief
      ? `Generate social creative for ${brief}. Use selected references when relevant. Keep raster free of baked text so editable overlays carry copy. Preserve brand/product identity and the referenced scene/subjects unless the creator asks otherwise.`
      : normalizeKnownProductText(cleaned);
  const product = resolveKnownProductMention(`${brief} ${cleaned}`);

  return {
    action,
    transcript: cleaned,
    brief,
    prompt,
    scope,
    referenceSearchQuery:
      action === 'generate-socials' && brief ? brief : undefined,
    publishMode,
    ...(targetPlatforms ? { targetPlatforms } : {}),
    needsPublishClarification,
    confidence: action === 'unknown' ? 0.2 : isSocial ? 0.82 : 0.6,
    source: 'heuristic',
    commandPlanner: { provider: 'heuristic', status: 'heuristic-fallback' },
    ...(product ? { product: productMatchFromResolution(product) } : {}),
  };
}

export function normalizeLlmCommand(
  transcript: string,
  parsed: Partial<VoiceCreatorCommand>,
  source: CommandLlmProviderId
): VoiceCreatorCommand {
  const fallback = parseVoiceCommandHeuristically(transcript);
  const parsedPublishMode =
    parsed.publishMode === 'auto-post' ||
    parsed.publishMode === 'review' ||
    parsed.publishMode === 'ask'
      ? parsed.publishMode
      : fallback.publishMode;
  const publishMode =
    parsedPublishMode === 'ask' && !fallback.needsPublishClarification
      ? fallback.publishMode
      : parsedPublishMode;
  const targetPlatforms =
    normalizePublishTargetPlatforms(parsed.targetPlatforms) ??
    fallback.targetPlatforms;
  const parsedAction =
    parsed.action === 'generate-socials' ||
    parsed.action === 'generate' ||
    parsed.action === 'unknown'
      ? parsed.action
      : fallback.action;
  const action =
    fallback.action === 'generate-socials' && parsedAction !== 'unknown'
      ? 'generate-socials'
      : parsedAction;
  const parsedBrief = typeof parsed.brief === 'string' ? parsed.brief.trim() : '';
  const brief =
    parsedBrief &&
    !(
      fallback.action === 'generate-socials' &&
      /^(?:(?:generate|make|create|draft|produce|build)\b|(?:a\s+)?campaign\s+for\b)/i.test(parsedBrief)
    )
      ? normalizeKnownProductText(parsedBrief)
      : fallback.brief;
  const parsedPrompt =
    typeof parsed.prompt === 'string' && parsed.prompt.trim()
      ? normalizeKnownProductText(parsed.prompt.trim())
      : undefined;
  const parsedReferenceSearchQuery =
    typeof parsed.referenceSearchQuery === 'string' &&
    parsed.referenceSearchQuery.trim()
      ? normalizeKnownProductText(parsed.referenceSearchQuery.trim())
      : undefined;
  const referenceSearchQuery =
    action === 'generate-socials' && fallback.referenceSearchQuery
      ? fallback.referenceSearchQuery
      : parsedReferenceSearchQuery ?? fallback.referenceSearchQuery;
  return {
    ...fallback,
    action,
    brief,
    prompt: parsedPrompt ?? fallback.prompt,
    scope:
      action === 'generate-socials'
        ? 'all'
        : parsed.scope === 'all' || parsed.scope === 'single'
          ? parsed.scope
          : fallback.scope,
    referenceSearchQuery,
    publishMode,
    ...(targetPlatforms ? { targetPlatforms } : {}),
    needsPublishClarification:
      publishMode === 'ask' ||
      (parsed.needsPublishClarification === true &&
        fallback.needsPublishClarification),
    confidence:
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : fallback.confidence,
    source,
    product: fallback.product,
  };
}

export async function enrichVoiceCommandWithProduct(input: {
  command: VoiceCreatorCommand;
  catalog?: readonly ProductCatalogEntry[];
  allowResearch?: boolean;
  research?: ProductResearcher | null;
}): Promise<VoiceCreatorCommand> {
  const catalog = input.catalog ?? DEFAULT_PRODUCT_CATALOG;
  const command = {
    ...input.command,
    brief: normalizeKnownProductText(input.command.brief, catalog),
    prompt: normalizeKnownProductText(input.command.prompt, catalog),
    referenceSearchQuery: input.command.referenceSearchQuery
      ? normalizeKnownProductText(input.command.referenceSearchQuery, catalog)
      : undefined,
  };
  const resolution = await resolveProductMention({
    text: productMatchText(command),
    researchQuery: productResearchQuery(command),
    catalog,
    allowResearch: input.allowResearch,
    research: input.research,
  });
  if (!resolution) return command;

  const product = productMatchFromResolution(resolution);
  const brief = resolveCreativeBrief(command, resolution);
  const prompt =
    command.action === 'generate-socials'
      ? socialPromptForProduct(brief, resolution)
      : normalizeKnownProductText(command.prompt, catalog);
  return {
    ...command,
    brief,
    prompt,
    referenceSearchQuery:
      resolution.imageSearchQuery || resolution.canonicalName || command.referenceSearchQuery,
    product,
  };
}

export function voiceCommandRequestsSupportedLocales(
  commandOrTranscript: Pick<VoiceCreatorCommand, 'transcript' | 'prompt'> | string
): boolean {
  const value =
    typeof commandOrTranscript === 'string'
      ? commandOrTranscript
      : `${commandOrTranscript.transcript} ${commandOrTranscript.prompt}`;
  return SUPPORTED_LANGUAGE_WORDS.test(value);
}

function resolvePlanLocales(
  command: VoiceCreatorCommand,
  context: VoiceGenerationPlanContext
): string[] {
  if (voiceCommandRequestsSupportedLocales(command)) {
    return SUPPORTED_LOCALES.map(String);
  }
  if (context.languageMode === 'multilingual') {
    return context.locales;
  }
  return context.locales.slice(0, 1);
}

export async function interpretVoiceTranscript(input: {
  transcript: string;
  context?: VoiceCommandContext;
  providerId?: CommandLlmProviderId;
  model?: string;
  productCatalog?: readonly ProductCatalogEntry[];
  allowProductResearch?: boolean;
  productResearch?: ProductResearcher | null;
}): Promise<VoiceCreatorCommand> {
  const fallback = parseVoiceCommandHeuristically(input.transcript);
  const attemptedModelFor = (
    provider?: Pick<ReturnType<typeof resolveCommandLlmProvider>, 'listModels'>
  ) =>
    input.model ||
    process.env.AETHER_COMMAND_MODEL ||
    provider?.listModels()[0];
  const fallbackWithPlanner = (
    err?: unknown,
    attemptedProvider?: CommandLlmProviderId,
    attemptedModel?: string
  ): VoiceCreatorCommand => ({
    ...fallback,
    commandPlanner: {
      provider: 'heuristic',
      status: 'heuristic-fallback',
      ...(input.providerId ? { requestedProvider: input.providerId } : {}),
      ...(input.model ? { requestedModel: input.model } : {}),
      ...(attemptedProvider ? { attemptedProvider } : {}),
      ...(attemptedModel ? { attemptedModel } : {}),
      ...(err instanceof Error
        ? { error: err.message }
        : err
          ? { error: String(err) }
          : {}),
    },
  });
  const enrich = (command: VoiceCreatorCommand) =>
    enrichVoiceCommandWithProduct({
      command,
      catalog: input.productCatalog,
      allowResearch: input.allowProductResearch,
      research: input.productResearch,
    });
  let provider;
  try {
    provider = resolveCommandLlmProvider(input.providerId);
  } catch (err) {
    return enrich(
      fallbackWithPlanner(err, input.providerId, attemptedModelFor())
    );
  }

  try {
    const result = await provider.completeJson<Partial<VoiceCreatorCommand>>({
      model: input.model,
      temperature: 0,
      system: [
        'Interpret a creator voice command for aether, a creator-first canvas tool.',
        'Return only JSON with keys: action, brief, prompt, scope, referenceSearchQuery, publishMode, targetPlatforms, needsPublishClarification, confidence.',
        'publishMode must be review, auto-post, or ask. Use ask only when the user mentions publishing but does not say auto-publish or review/approval.',
        'targetPlatforms is optional. When the user names publish destinations, return an array using only: x, linkedin, instagram, tiktok, pinterest, youtube-shorts, xhs, douyin, bilibili, kuaishou.',
        'Use scope=all for social creative or multi-format requests.',
      ].join('\n'),
      user: JSON.stringify({
        transcript: input.transcript,
        context: input.context,
      }),
    });
    return enrich(
      {
        ...normalizeLlmCommand(input.transcript, result.json, result.provider.id),
        commandPlanner: {
          provider: result.provider.id,
          ...(result.provider.model ? { model: result.provider.model } : {}),
          status: 'llm',
          ...(input.providerId ? { requestedProvider: input.providerId } : {}),
          ...(input.model ? { requestedModel: input.model } : {}),
        },
      }
    );
  } catch (err) {
    return enrich(
      fallbackWithPlanner(err, provider.id, attemptedModelFor(provider))
    );
  }
}

function productMatchFromResolution(
  resolution: ProductResolution
): VoiceCommandProductMatch {
  return {
    id: resolution.id,
    canonicalName: resolution.canonicalName,
    brand: resolution.brand,
    productName: resolution.productName,
    source: resolution.source,
    confidence: resolution.confidence,
    description: resolution.description,
    officialUrl: resolution.officialUrl,
    imageSearchQuery: resolution.imageSearchQuery,
    imageUrls: resolution.imageUrls,
  };
}

function productMatchText(command: VoiceCreatorCommand): string {
  return [
    command.brief,
    command.referenceSearchQuery,
    command.prompt,
    command.transcript,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
}

function productResearchQuery(command: VoiceCreatorCommand): string {
  const candidates = [
    command.brief,
    command.referenceSearchQuery,
    trimCommandNoise(command.transcript).replace(LEADING_VERBS, '').replace(SOCIAL_WORDS, ''),
  ].filter((value): value is string => typeof value === 'string');
  return (
    candidates.find((value) => value.trim().length > 0 && value.trim().length < 140) ??
    command.transcript
  ).trim();
}

function resolveCreativeBrief(
  command: VoiceCreatorCommand,
  resolution: ProductResolution
): string {
  const brief = command.brief.trim();
  if (!brief) return resolution.canonicalName;
  const normalizedBrief = normalizeKnownProductText(brief);
  if (resolution.source === 'catalog') {
    return normalizeForMatch(normalizedBrief).includes(
      normalizeForMatch(resolution.canonicalName)
    )
      ? normalizedBrief
      : resolution.canonicalName;
  }
  return normalizedBrief.length > 0 ? normalizedBrief : resolution.canonicalName;
}

function socialPromptForProduct(
  brief: string,
  resolution: ProductResolution
): string {
  const productFocus =
    brief === resolution.canonicalName
      ? resolution.canonicalName
      : `${brief}. Product focus: ${resolution.canonicalName}`;
  const description = resolution.description
    ? ` Use product facts from this research note: ${resolution.description}`
    : '';
  return `Generate social creative for ${productFocus}.${description} Use selected references when relevant. If none are relevant, generate from the brief. Keep raster free of baked text so editable overlays carry copy. Preserve brand/product identity and the referenced scene/subjects unless the creator asks otherwise.`;
}

export function buildVoiceGenerationPlan(
  command: VoiceCreatorCommand,
  context: VoiceGenerationPlanContext
): VoiceGenerationPlan {
  const publishMode =
    context.publishMode ??
    (command.publishMode === 'auto-post' ? 'auto-post' : 'review');
  const targetPlatforms = context.targetPlatforms ?? command.targetPlatforms;
  const refs = context.referenceUrls?.filter(Boolean) ?? [];
  const languages = resolvePlanLocales(command, context);
  const renderMode =
    command.scope === 'all' ? 'hero-seeded-fanout' : 'crop';
  const heroCount =
    renderMode === 'hero-seeded-fanout'
      ? Math.max(1, Math.min(3, Math.round(context.heroCount ?? 2)))
      : undefined;
  return {
    prompt: command.prompt,
    options: {
      scope: command.scope,
      renderMode,
      ...(heroCount ? { heroCount } : {}),
      notifyMode: publishMode,
      ...(targetPlatforms?.length ? { targetPlatforms } : {}),
      ...(refs.length > 0 ? { refs } : {}),
    },
    statusChips: [
      {
        label: 'intent',
        value:
          command.action === 'generate-socials'
            ? 'generate socials'
            : command.action,
      },
      { label: 'refs', value: String(refs.length) },
      { label: 'formats', value: String(context.formats.length) },
      ...(heroCount ? [{ label: 'heroes', value: String(heroCount) }] : []),
      { label: 'languages', value: languages.join(', ') || 'none' },
      ...(targetPlatforms?.length
        ? [{ label: 'platforms', value: targetPlatforms.join(', ') }]
        : []),
      { label: 'publish', value: publishMode },
    ],
  };
}
