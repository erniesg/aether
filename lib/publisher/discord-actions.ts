import { localeShortLabel } from '@/lib/locale/registry';
import type { DiscordActionRow } from '@/lib/notify/discord';
import type { PublishPlatform } from '@/lib/providers/publisher/types';
import {
  parsePublishLocalesParam,
  parsePublishPlatformsParam,
  type LocaleCode,
} from '@/lib/publisher/payload';

const DISCORD_PRIMARY_LOCALE: LocaleCode = 'en-SG';
const DISCORD_SECONDARY_LOCALE: LocaleCode = 'zh-Hans-SG';
const DISCORD_QUICK_PLATFORMS: PublishPlatform[] = ['x', 'linkedin'];

export interface DiscordPublishSelection {
  platforms: PublishPlatform[];
  locales: LocaleCode[];
}

export interface BuildDiscordPublishUrlInput {
  baseUrl: string;
  campaignId: string;
  variationIndex: number;
  platforms: ReadonlyArray<PublishPlatform>;
  locale: LocaleCode;
  workspaceId?: string;
}

export function buildDiscordPublishUrl(
  input: BuildDiscordPublishUrlInput
): string {
  const url = new URL('/api/auto-mode/post-now', input.baseUrl.replace(/\/+$/, ''));
  url.searchParams.set('c', input.campaignId);
  url.searchParams.set('v', String(input.variationIndex));
  url.searchParams.set('p', input.platforms.join(','));
  url.searchParams.set('l', input.locale);
  if (input.workspaceId) url.searchParams.set('ws', input.workspaceId);
  return url.toString();
}

export function parseDiscordPublishSelection(
  searchParams: URLSearchParams
): DiscordPublishSelection {
  return {
    platforms: parsePublishPlatformsParam(
      searchParams.get('p') ?? searchParams.get('platforms')
    ),
    locales: parsePublishLocalesParam(
      searchParams.get('l') ?? searchParams.get('locale') ?? searchParams.get('locales')
    ),
  };
}

export interface BuildDiscordPublishChoiceRowsInput {
  baseUrl: string;
  campaignId: string | null;
  variationIndex: number;
  availableLocales?: ReadonlyArray<LocaleCode>;
  workspaceId?: string;
  rejectUrl?: string;
}

export function buildDiscordPublishChoiceRow(
  input: BuildDiscordPublishChoiceRowsInput
): DiscordActionRow | null {
  if (!input.campaignId) return null;
  const locales = input.availableLocales?.length
    ? input.availableLocales
    : [DISCORD_PRIMARY_LOCALE];
  const primary = locales.includes(DISCORD_PRIMARY_LOCALE)
    ? DISCORD_PRIMARY_LOCALE
    : locales[0] ?? DISCORD_PRIMARY_LOCALE;
  const secondary = locales.find((locale) => locale !== primary) ??
    (locales.includes(DISCORD_SECONDARY_LOCALE)
      ? DISCORD_SECONDARY_LOCALE
      : undefined);

  const components: DiscordActionRow['components'] = [
    {
      type: 2,
      style: 5,
      label: `${localeShortLabel(primary)} X`,
      url: buildDiscordPublishUrl({
        ...input,
        campaignId: input.campaignId,
        platforms: ['x'],
        locale: primary,
      }),
    },
    {
      type: 2,
      style: 5,
      label: `${localeShortLabel(primary)} LinkedIn`,
      url: buildDiscordPublishUrl({
        ...input,
        campaignId: input.campaignId,
        platforms: ['linkedin'],
        locale: primary,
      }),
    },
    {
      type: 2,
      style: 5,
      label: `${localeShortLabel(primary)} both`,
      url: buildDiscordPublishUrl({
        ...input,
        campaignId: input.campaignId,
        platforms: DISCORD_QUICK_PLATFORMS,
        locale: primary,
      }),
    },
  ];

  if (secondary) {
    components.push({
      type: 2,
      style: 5,
      label: `${localeShortLabel(secondary)} both`,
      url: buildDiscordPublishUrl({
        ...input,
        campaignId: input.campaignId,
        platforms: DISCORD_QUICK_PLATFORMS,
        locale: secondary,
      }),
    });
  }

  if (input.rejectUrl && components.length < 5) {
    components.push({
      type: 2,
      style: 5,
      label: 'Reject',
      url: input.rejectUrl,
    });
  }

  return { type: 1, components };
}

export function buildDiscordPublishLinks(input: {
  baseUrl: string;
  campaignId: string | null;
  variationIndex: number;
  availableLocales?: ReadonlyArray<LocaleCode>;
  workspaceId?: string;
}): string[] {
  if (!input.campaignId) return [];
  const locales = (input.availableLocales?.length
    ? input.availableLocales
    : [DISCORD_PRIMARY_LOCALE]
  ).slice(0, 4);

  return locales.map((locale) => {
    const label = localeShortLabel(locale);
    const x = buildDiscordPublishUrl({
      ...input,
      campaignId: input.campaignId!,
      platforms: ['x'],
      locale,
    });
    const linkedin = buildDiscordPublishUrl({
      ...input,
      campaignId: input.campaignId!,
      platforms: ['linkedin'],
      locale,
    });
    const both = buildDiscordPublishUrl({
      ...input,
      campaignId: input.campaignId!,
      platforms: DISCORD_QUICK_PLATFORMS,
      locale,
    });
    return `${label}: [X](${x}) / [LinkedIn](${linkedin}) / [both](${both})`;
  });
}
