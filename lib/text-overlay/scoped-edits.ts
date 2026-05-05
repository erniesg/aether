import type { ProposedTextOverlay } from '@/lib/agent/text-apply';
import { DEFAULT_LOCALE } from '@/lib/locale/registry';
import { deterministicTranslateText } from './translation';

export type TextEditScope = 'global' | 'local';

export interface ScopedTextOverlayMetadata {
  sourceLocale?: string;
  translatedFrom?: Record<string, string>;
  translationProvider?: Record<string, string>;
  updatedAt?: number;
  provenance?: Record<string, unknown>;
  localOverrides?: Record<string, Record<string, boolean>>;
  heroDirectionId?: string;
}

export type ScopedTextOverlay = ProposedTextOverlay & {
  formatContent?: Record<string, Record<string, string>>;
  metadata?: ScopedTextOverlayMetadata;
  scope?: TextEditScope;
};

export interface ApplyScopedTextEditInput {
  variationId?: string;
  heroDirectionId?: string;
  format: string;
  role: string;
  locale: string;
  scope: TextEditScope;
  text: string;
  translateLinked?: boolean;
  targetLocales?: ReadonlyArray<string>;
  overwriteTranslations?: boolean;
  now?: number;
}

export function applyScopedTextEditToOverlays(
  overlays: ReadonlyArray<ScopedTextOverlay>,
  edit: ApplyScopedTextEditInput
): ScopedTextOverlay[] {
  let matched = false;
  const next = overlays.map((overlay) => {
    if (overlay.zone.purpose !== edit.role) return overlay;
    if (
      edit.heroDirectionId &&
      overlay.metadata?.heroDirectionId &&
      overlay.metadata.heroDirectionId !== edit.heroDirectionId
    ) {
      return overlay;
    }
    matched = true;
    return applyEditToOverlay(overlay, edit);
  });

  if (!matched) {
    next.push(
      applyEditToOverlay(
        {
          zone: { purpose: edit.role as ProposedTextOverlay['zone']['purpose'], bbox: { x: 0, y: 0, w: 1, h: 0.1 } },
          content: {} as ProposedTextOverlay['content'],
          textAlign: 'center',
        },
        edit
      )
    );
  }

  return next;
}

function applyEditToOverlay(
  overlay: ScopedTextOverlay,
  edit: ApplyScopedTextEditInput
): ScopedTextOverlay {
  const now = edit.now ?? Date.now();
  const metadata = cloneMetadata(overlay.metadata);
  metadata.sourceLocale = edit.locale;
  if (edit.heroDirectionId) metadata.heroDirectionId = edit.heroDirectionId;
  metadata.updatedAt = now;
  metadata.provenance = {
    ...(metadata.provenance ?? {}),
    kind: 'canvas-text-edit',
    scope: edit.scope,
    locale: edit.locale,
    format: edit.format,
    role: edit.role,
    variationId: edit.variationId,
    heroDirectionId: edit.heroDirectionId,
  };

  const next: ScopedTextOverlay = {
    ...overlay,
    content: { ...(overlay.content ?? {}) },
    formatContent: overlay.formatContent ? cloneFormatContent(overlay.formatContent) : undefined,
    metadata,
  };

  if (edit.scope === 'local') {
    next.formatContent = {
      ...(next.formatContent ?? {}),
      [edit.format]: {
        ...(next.formatContent?.[edit.format] ?? {}),
        [edit.locale]: edit.text,
      },
    };
    markLocalOverride(metadata, edit.format, edit.locale);
    delete metadata.translatedFrom?.[edit.locale];
    delete metadata.translationProvider?.[edit.locale];
  } else {
    next.content = {
      ...(next.content ?? {}),
      [edit.locale]: edit.text,
    };
    clearLocalOverride(metadata, edit.format, edit.locale);
    if (next.formatContent?.[edit.format]) {
      delete next.formatContent[edit.format][edit.locale];
      if (Object.keys(next.formatContent[edit.format]).length === 0) {
        delete next.formatContent[edit.format];
      }
    }
    if (next.formatContent && Object.keys(next.formatContent).length === 0) {
      delete next.formatContent;
    }
  }

  if (edit.locale === DEFAULT_LOCALE && edit.translateLinked) {
    applyLinkedTranslations(next, edit, metadata);
  }

  return next;
}

function applyLinkedTranslations(
  overlay: ScopedTextOverlay,
  edit: ApplyScopedTextEditInput,
  metadata: ScopedTextOverlayMetadata
): void {
  const targets = (edit.targetLocales ?? []).filter(
    (locale) => locale !== edit.locale
  );
  for (const targetLocale of targets) {
    const translated = deterministicTranslateText({
      text: edit.text,
      sourceLocale: edit.locale,
      targetLocale,
    });
    if (!translated) continue;
    if (edit.scope === 'local') {
      if (
        !edit.overwriteTranslations &&
        hasExplicitLocalOverride(overlay, edit.format, targetLocale)
      ) {
        continue;
      }
      overlay.formatContent = {
        ...(overlay.formatContent ?? {}),
        [edit.format]: {
          ...(overlay.formatContent?.[edit.format] ?? {}),
          [targetLocale]: translated,
        },
      };
    } else {
      overlay.content = {
        ...(overlay.content ?? {}),
        [targetLocale]: translated,
      };
    }
    metadata.translatedFrom = {
      ...(metadata.translatedFrom ?? {}),
      [targetLocale]: edit.locale,
    };
    metadata.translationProvider = {
      ...(metadata.translationProvider ?? {}),
      [targetLocale]: 'deterministic-fallback',
    };
  }
}

function cloneFormatContent(
  input: Record<string, Record<string, string>>
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [format, content] of Object.entries(input)) {
    out[format] = { ...content };
  }
  return out;
}

function cloneMetadata(
  metadata: ScopedTextOverlayMetadata | undefined
): ScopedTextOverlayMetadata {
  return {
    ...(metadata ?? {}),
    translatedFrom: metadata?.translatedFrom ? { ...metadata.translatedFrom } : undefined,
    translationProvider: metadata?.translationProvider
      ? { ...metadata.translationProvider }
      : undefined,
    provenance: metadata?.provenance ? { ...metadata.provenance } : undefined,
    localOverrides: metadata?.localOverrides
      ? cloneLocalOverrides(metadata.localOverrides)
      : undefined,
  };
}

function cloneLocalOverrides(
  input: Record<string, Record<string, boolean>>
): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const [format, locales] of Object.entries(input)) {
    out[format] = { ...locales };
  }
  return out;
}

function hasExplicitLocalOverride(
  overlay: ScopedTextOverlay,
  format: string,
  locale: string
): boolean {
  if (overlay.metadata?.localOverrides?.[format]?.[locale] === true) return true;
  const formatText = overlay.formatContent?.[format]?.[locale];
  if (formatText === undefined) return false;
  return overlay.metadata?.translatedFrom?.[locale] !== DEFAULT_LOCALE;
}

function markLocalOverride(
  metadata: ScopedTextOverlayMetadata,
  format: string,
  locale: string
): void {
  metadata.localOverrides = {
    ...(metadata.localOverrides ?? {}),
    [format]: {
      ...(metadata.localOverrides?.[format] ?? {}),
      [locale]: true,
    },
  };
}

function clearLocalOverride(
  metadata: ScopedTextOverlayMetadata,
  format: string,
  locale: string
): void {
  if (!metadata.localOverrides?.[format]?.[locale]) return;
  const nextFormat = { ...metadata.localOverrides[format] };
  delete nextFormat[locale];
  if (Object.keys(nextFormat).length > 0) {
    metadata.localOverrides = {
      ...metadata.localOverrides,
      [format]: nextFormat,
    };
  } else {
    const next = { ...metadata.localOverrides };
    delete next[format];
    metadata.localOverrides =
      Object.keys(next).length > 0 ? next : undefined;
  }
}
