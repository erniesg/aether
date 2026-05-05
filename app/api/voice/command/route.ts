import { NextResponse } from 'next/server';
import { normalizeCommandProviderId } from '@/lib/providers/llm/registry';
import { interpretVoiceTranscript } from '@/lib/voice/command';
import type { VoiceCommandContext } from '@/lib/voice/command';
import {
  DEFAULT_PRODUCT_CATALOG,
  type ProductCatalogEntry,
} from '@/lib/product/catalog';
import {
  listWorkspaceProducts,
  upsertWorkspaceProduct,
} from '@/lib/convex/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseContext(value: unknown): VoiceCommandContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const formats = Array.isArray(input.formats)
    ? input.formats.flatMap((format) => {
        if (!format || typeof format !== 'object') return [];
        const f = format as Record<string, unknown>;
        if (typeof f.id !== 'string') return [];
        return [
          {
            id: f.id,
            label: typeof f.label === 'string' ? f.label : undefined,
            aspectRatio:
              typeof f.aspectRatio === 'string' ? f.aspectRatio : undefined,
          },
        ];
      })
    : [];
  const locales = Array.isArray(input.locales)
    ? input.locales.filter((locale): locale is string => typeof locale === 'string')
    : [];
  return {
    formats,
    locales,
    languageMode:
      input.languageMode === 'multilingual' ? 'multilingual' : 'single',
    workspaceId:
      typeof input.workspaceId === 'string' && input.workspaceId.trim()
        ? input.workspaceId.trim()
        : undefined,
  };
}

function mergeCatalogEntries(
  entries: ReadonlyArray<ProductCatalogEntry>
): ProductCatalogEntry[] {
  const byId = new Map<string, ProductCatalogEntry>();
  for (const entry of entries) {
    const id = entry.id || entry.canonicalName.toLowerCase();
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, entry);
      continue;
    }
    byId.set(id, {
      ...existing,
      ...entry,
      aliases: Array.from(new Set([...existing.aliases, ...entry.aliases])),
      confidence: Math.max(existing.confidence, entry.confidence),
    });
  }
  return Array.from(byId.values());
}

function entryFromCommand(
  command: Awaited<ReturnType<typeof interpretVoiceTranscript>>
): ProductCatalogEntry | null {
  if (!command.product) return null;
  if (command.product.source === 'research' && command.product.confidence < 0.8) {
    return null;
  }
  return {
    id: command.product.id,
    canonicalName: command.product.canonicalName,
    brand: command.product.brand,
    productName: command.product.productName,
    aliases: Array.from(
      new Set(
        [
          command.product.canonicalName,
          command.brief,
          command.referenceSearchQuery,
          command.transcript,
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ),
    description: command.product.description,
    officialUrl: command.product.officialUrl,
    imageSearchQuery:
      command.product.imageSearchQuery ??
      command.referenceSearchQuery ??
      command.product.canonicalName,
    source: command.product.source,
    confidence: command.product.confidence,
    updatedAt: Date.now(),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError(400, 'body must be an object');
  }
  const b = body as Record<string, unknown>;
  const transcript = typeof b.transcript === 'string' ? b.transcript.trim() : '';
  if (!transcript) return jsonError(400, 'transcript is required');
  const context = parseContext(b.context);
  const workspaceProducts = await listWorkspaceProducts(context?.workspaceId);
  const productCatalog = mergeCatalogEntries([
    ...DEFAULT_PRODUCT_CATALOG,
    ...workspaceProducts,
  ]);

  const command = await interpretVoiceTranscript({
    transcript,
    context,
    providerId:
      typeof b.providerId === 'string'
        ? normalizeCommandProviderId(b.providerId)
        : undefined,
    model: typeof b.model === 'string' ? b.model : undefined,
    productCatalog,
    allowProductResearch: true,
  });
  const productEntry = entryFromCommand(command);
  if (productEntry) {
    await upsertWorkspaceProduct({
      workspaceId: context?.workspaceId,
      product: productEntry,
      aliases: [transcript, command.brief, command.referenceSearchQuery ?? ''],
    });
  }

  return NextResponse.json({
    ok: true,
    command,
    planner: command.commandPlanner ?? {
      provider: command.source,
      status: command.source === 'heuristic' ? 'heuristic-fallback' : 'llm',
    },
  });
}
