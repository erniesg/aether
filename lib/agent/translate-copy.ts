import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/agent/text-apply';
import {
  deterministicTranslateText,
  looksLikeDeterministicFallbackDraft,
} from '@/lib/text-overlay/translation';

export interface TranslateCanvasCopyInput {
  text: string;
  sourceLocale: string;
  targetLocales: ReadonlyArray<string>;
  role?: string;
  brandName?: string;
}

export async function translateCanvasCopy(
  input: TranslateCanvasCopyInput
): Promise<Record<string, string>> {
  const sourceText = input.text.trim();
  if (!sourceText) return {};

  const targetLocales = [...new Set(input.targetLocales)]
    .map((locale) => locale.trim())
    .filter((locale) => locale && locale !== input.sourceLocale);
  if (targetLocales.length === 0) return {};

  const modelTranslations = await translateWithAnthropic({
    ...input,
    text: sourceText,
    targetLocales,
  });
  const out: Record<string, string> = {};
  for (const locale of targetLocales) {
    const modelText = modelTranslations[locale]?.trim();
    const fallbackText = deterministicTranslateText({
      text: sourceText,
      sourceLocale: input.sourceLocale,
      targetLocale: locale,
    }).trim();
    const picked = modelText || fallbackText;
    if (!isUsableTranslation(sourceText, picked)) continue;
    out[locale] = picked;
  }
  return out;
}

async function translateWithAnthropic(
  input: TranslateCanvasCopyInput
): Promise<Record<string, string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return {};

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system:
        'Translate short editable marketing overlay copy for a creator canvas. Return only compact JSON. Preserve meaning, tone, and length. Do not append draft markers or explanations.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sourceLocale: input.sourceLocale,
                targetLocales: input.targetLocales,
                role: input.role,
                brandName: input.brandName,
                text: input.text,
                outputShape: { translations: { '<locale>': '<localized text>' } },
              }),
            },
          ],
        },
      ],
    });
    const text = msg.content
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();
    const parsed = parseJsonObject(text);
    const raw = parsed?.translations;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [locale, value] of Object.entries(raw)) {
      if (typeof value === 'string') out[locale] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function isUsableTranslation(sourceText: string, candidate: string): boolean {
  const clean = candidate.trim();
  if (!clean) return false;
  if (looksLikeDeterministicFallbackDraft(clean)) return false;
  return clean.toLocaleLowerCase() !== sourceText.trim().toLocaleLowerCase();
}
