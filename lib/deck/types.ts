export type DeckSlideKind =
  | 'title'
  | 'section'
  | 'split-proof'
  | 'diagram'
  | 'live-demo'
  | 'code-reference'
  | 'metric-strip'
  | 'closing'
  | 'custom';

export interface DeckFragment {
  id: string;
  label?: string;
  order?: number;
}

export interface DeckHotspot {
  id: string;
  label: string;
  x: number;
  y: number;
  target?: string;
}

export interface DeckSpeakerNotes {
  summary?: string;
  bullets?: string[];
}

export interface DeckPresenterModeState {
  enabled: boolean;
  audienceWindowId?: string;
}

export interface DeckSlideProvenance {
  type: 'generated' | 'hand-authored' | 'fixture' | 'imported';
  source?: string;
  actionId?: string;
}

export interface DeckNavigationState {
  slideIndex: number;
  fragmentIndex: number;
  slideId?: string;
  presenterMode?: DeckPresenterModeState;
}
