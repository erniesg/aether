import type { DeckLiveDemoConfig, DeckRequestAuthMode } from './liveDemo';

export type DeckSlideLayout =
  | 'title'
  | 'section'
  | 'split-proof'
  | 'diagram'
  | 'live-demo'
  | 'code-reference'
  | 'metric-strip'
  | 'closing';

export interface DeckStyleTokens {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
}

export interface DeckFragment {
  id: string;
  order: number;
  targetBlockId: string;
}

export interface DeckHotspot {
  id: string;
  label: string;
  targetSlideId: string;
  targetBlockId?: string;
}

export interface DeckBlock {
  id: string;
  kind: 'copy' | 'product-frame' | 'api-call' | 'code-reference' | 'metrics' | 'links';
  eyebrow?: string;
  title?: string;
  body?: string;
  items?: string[];
  endpointId?: string;
  codeReferenceIds?: string[];
  productUrl?: string;
  artwork?: {
    title: string;
    artist: string;
    year: string | number;
    imageUrl: string;
    sourceUrl: string;
    accessionNumber: string;
    medium: string;
    dimensions: string;
    institution: string;
  };
  requestBody?: Record<string, unknown>;
  requestMode?: 'json' | 'image';
  mockResponse?: unknown;
  authMode?: DeckRequestAuthMode;
}

export interface DeckSlide {
  id: string;
  title: string;
  layout: DeckSlideLayout;
  section: 'intro' | 'live-demo' | 'deep-dive' | 'closing';
  blocks: DeckBlock[];
  fragments?: DeckFragment[];
  hotspots?: DeckHotspot[];
  branchTargets?: string[];
  speakerNotes: string;
  presenterLabel?: string;
}

export interface DeckCodeReference {
  id: string;
  filePath: string;
  label: string;
  whyItMatters: string;
}

export interface DeckProvenanceRecord {
  id: string;
  action: string;
  sourceRefs: Array<{ kind: 'repo' | 'site' | 'capture' | 'upload' | 'reference'; ref: string }>;
  inputs: string[];
  outputs: string[];
  beforeSnapshotRef: string | null;
  afterSnapshotRef: string;
  timestamp: number;
}

export interface DeckGraphNode {
  id: string;
  kind: 'deck' | 'slide' | 'block' | 'reference';
  parentId?: string;
  ref: string;
}

export interface DeckArtifact {
  id: string;
  artifactKind: 'deck';
  title: string;
  stage: { width: 1920; height: 1080 };
  styleTokens: DeckStyleTokens;
  slides: DeckSlide[];
  drawerTabs: ['Product', 'API', 'Code'];
  liveDemo: DeckLiveDemoConfig;
  codeReferences: DeckCodeReference[];
  graphNodes: DeckGraphNode[];
  provenance: DeckProvenanceRecord[];
  handoffNotes: string[];
  knownWarnings: string[];
}
