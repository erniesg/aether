import JSZip from 'jszip';
import type { DeckArtifact } from './types';

export interface DeckScreenshotProof {
  slideId: string;
  filename: string;
  bytes: Uint8Array;
}

export interface DeckExportPackInput {
  deck: DeckArtifact;
  screenshots?: DeckScreenshotProof[];
  contactSheet?: Uint8Array;
  standaloneHtml?: string;
  now?: Date;
}

export interface DeckExportManifest {
  artifactKind: 'deck';
  deckId: string;
  generatedAt: string;
  sourceOfTruth: 'graph-backed-aether-deck';
  slideOrder: string[];
  styleTokens: DeckArtifact['styleTokens'];
  codeReferences: DeckArtifact['codeReferences'];
  liveDemoAllowlist: Array<{
    id: string;
    method: string;
    path: string;
    authModes: string[];
  }>;
  provenance: DeckArtifact['provenance'];
  presenter: {
    fragmentOrder: Record<string, string[]>;
    hotspotTargets: Record<string, string[]>;
    branchTargets: Record<string, string[]>;
    speakerNotes: Record<string, string>;
    presenterLabels: Record<string, string>;
  };
  staticFallbacks: Array<{ blockId: string; endpointId: string; kind: 'mock-response'; value: unknown }>;
  proof: { screenshots: string[]; contactSheet: string | null };
  knownWarnings: string[];
}

export async function buildDeckExportPack(input: DeckExportPackInput) {
  const zip = new JSZip();
  const screenshots = input.screenshots ?? [];
  const manifest: DeckExportManifest = {
    artifactKind: 'deck',
    deckId: input.deck.id,
    generatedAt: (input.now ?? new Date()).toISOString(),
    sourceOfTruth: 'graph-backed-aether-deck',
    slideOrder: input.deck.slides.map((slide) => slide.id),
    styleTokens: input.deck.styleTokens,
    codeReferences: input.deck.codeReferences,
    liveDemoAllowlist: input.deck.liveDemo.endpoints.map((endpoint) => ({
      id: endpoint.id,
      method: endpoint.method,
      path: endpoint.path,
      authModes: [...endpoint.authModes],
    })),
    provenance: input.deck.provenance,
    presenter: {
      fragmentOrder: Object.fromEntries(input.deck.slides.map((slide) => [slide.id, (slide.fragments ?? []).sort((a, b) => a.order - b.order).map((fragment) => fragment.id)])),
      hotspotTargets: Object.fromEntries(input.deck.slides.map((slide) => [slide.id, (slide.hotspots ?? []).map((hotspot) => hotspot.targetSlideId)])),
      branchTargets: Object.fromEntries(input.deck.slides.map((slide) => [slide.id, slide.branchTargets ?? []])),
      speakerNotes: Object.fromEntries(input.deck.slides.map((slide) => [slide.id, slide.speakerNotes])),
      presenterLabels: Object.fromEntries(input.deck.slides.map((slide) => [slide.id, slide.presenterLabel ?? slide.title])),
    },
    staticFallbacks: input.deck.slides.flatMap((slide) =>
      slide.blocks.flatMap((block) =>
        block.kind === 'api-call' && block.endpointId && block.mockResponse !== undefined
          ? [{ blockId: block.id, endpointId: block.endpointId, kind: 'mock-response' as const, value: block.mockResponse }]
          : []
      )
    ),
    proof: {
      screenshots: screenshots.map((screenshot) => `proof/${screenshot.filename}`),
      contactSheet: input.contactSheet ? 'proof/contact-sheet.png' : null,
    },
    knownWarnings: input.deck.knownWarnings,
  };

  zip.file('deck.json', JSON.stringify(input.deck, null, 2));
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('source/outline.json', JSON.stringify(input.deck.slides.map(({ id, title, section }) => ({ id, title, section })), null, 2));
  zip.file('source/storyboard-notes.txt', input.deck.slides.map((slide, index) => `${index + 1}. ${slide.title}\n${slide.speakerNotes}`).join('\n\n'));
  zip.file('source/handoff-notes.txt', input.deck.handoffNotes.join('\n'));
  zip.file('source/validation-commands.txt', 'npm test\nnpm run typecheck\nnpx eslint components/deck lib/deck');
  zip.file('source/known-warnings.txt', input.deck.knownWarnings.join('\n'));
  if (input.standaloneHtml) zip.file('standalone/index.html', input.standaloneHtml);
  for (const screenshot of screenshots) zip.file(`proof/${screenshot.filename}`, screenshot.bytes);
  if (input.contactSheet) zip.file('proof/contact-sheet.png', input.contactSheet);
  const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { zip: zipBytes, manifest, filenames: Object.keys(zip.files) };
}
