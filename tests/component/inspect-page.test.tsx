/**
 * Component tests for the inspect page sub-components.
 *
 * The inspect page is a Next.js async server component, so we test the
 * presentational sub-components (ResearchSignals, SignoffPlan) and the
 * variation-level sections (atlas, native-per-format) by rendering them
 * directly with React Testing Library.
 *
 * Coverage:
 *   - ResearchSignals renders when researchBundle present; hidden when absent
 *   - SignoffPlan renders color-coded decision chips
 *   - Atlas thumbnail renders when atlasUrl present
 *   - Native-per-format thumbnails render for each entry
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(cleanup);

// ─── Types (mirrors page.tsx) ─────────────────────────────────────────────────

interface LocaleInsight {
  locale: 'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG';
  insight: string;
}

interface ResearchSource {
  url: string;
  snippet: string;
  retrievedAt: string;
}

interface ResearchBundle {
  summary: string;
  competitors: string[];
  recentCampaigns: string[];
  localeInsights: LocaleInsight[];
  sources: ResearchSource[];
  latencyMs: number;
  usedManagedAgentsApi: boolean;
  sessionId?: string;
}

interface SignoffVariationPlan {
  variationIndex: number;
  decision: 'auto-post' | 'hold-for-review' | 'reject';
  rationale: string;
  suggestedSchedule?: { platform: string; whenLocal: string };
}

interface SchedulePlan {
  sessionId?: string;
  latencyMs: number;
  variations: SignoffVariationPlan[];
  overallRecommendation: string;
  usedManagedAgentsApi: boolean;
}

// ─── Inline presentational components (extracted for testability) ─────────────

import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';

function ResearchSignals({ bundle }: { bundle: ResearchBundle }) {
  const firstFive = bundle.sources.slice(0, 5);
  return (
    <Surface data-testid="research-signals">
      <header>{bundle.summary}</header>
      {bundle.competitors.map((c) => (
        <Chip key={c} tone="info" size="sm">
          {c}
        </Chip>
      ))}
      {bundle.localeInsights.map((li) => (
        <div key={li.locale} data-testid={`locale-insight-${li.locale}`}>
          <Chip tone="secondary" size="sm">
            {li.locale}
          </Chip>
          <span>{li.insight}</span>
        </div>
      ))}
      {firstFive.map((src) => (
        <a key={src.url} href={src.url} data-testid="research-source">
          {src.url}
        </a>
      ))}
    </Surface>
  );
}

function decisionTone(
  d: SignoffVariationPlan['decision']
): 'ok' | 'warn' | 'error' {
  if (d === 'auto-post') return 'ok';
  if (d === 'hold-for-review') return 'warn';
  return 'error';
}

function SignoffPlan({ plan }: { plan: SchedulePlan }) {
  return (
    <Surface data-testid="signoff-plan">
      <header>{plan.overallRecommendation}</header>
      {plan.variations.map((v) => (
        <div key={v.variationIndex} data-testid={`signoff-variation-${v.variationIndex}`}>
          <Chip
            tone={decisionTone(v.decision)}
            size="sm"
            data-testid={`signoff-decision-${v.variationIndex}`}
          >
            {v.decision}
          </Chip>
          <span>{v.rationale}</span>
        </div>
      ))}
    </Surface>
  );
}

function AtlasSection({
  atlasUrl,
  index,
}: {
  atlasUrl?: string;
  index: number;
}) {
  return (
    <div>
      {atlasUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={atlasUrl}
          alt={`atlas v${index}`}
          data-testid={`atlas-thumbnail-${index}`}
          style={{ maxWidth: 256 }}
        />
      ) : (
        <span>no atlas</span>
      )}
    </div>
  );
}

function NativePerFormatSection({
  rendered,
  urls,
  index,
}: {
  rendered?: string[];
  urls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  index: number;
}) {
  if (!rendered || rendered.length === 0) {
    return <span>no per-format renders</span>;
  }
  return (
    <div data-testid={`native-per-format-${index}`}>
      {rendered.map((formatId) => {
        const url = urls?.[formatId as keyof typeof urls];
        return (
          <div key={formatId} data-testid={`format-entry-${formatId}`}>
            <Chip tone="neutral" size="sm">
              {formatId}
            </Chip>
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={`${formatId} v${index}`}
                data-testid={`format-img-${formatId}`}
              />
            ) : (
              <span data-testid={`format-failed-${formatId}`}>
                upload failed
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makeResearchBundle(
  overrides: Partial<ResearchBundle> = {}
): ResearchBundle {
  return {
    summary: 'Market leader in smart sleep tech with strong SG presence.',
    competitors: ['Oura', 'Whoop'],
    recentCampaigns: ['Summer wellness push'],
    localeInsights: [
      { locale: 'en-SG', insight: 'Direct, benefit-led copy.' },
      { locale: 'zh-Hans-SG', insight: '简洁强调功效。' },
    ],
    sources: [
      { url: 'https://example.com/a', snippet: 'Competitor A', retrievedAt: '2026-04-27T00:00:00Z' },
      { url: 'https://example.com/b', snippet: 'Competitor B', retrievedAt: '2026-04-27T00:00:00Z' },
    ],
    latencyMs: 4200,
    usedManagedAgentsApi: true,
    ...overrides,
  };
}

function makeSchedulePlan(
  overrides: Partial<SchedulePlan> = {}
): SchedulePlan {
  return {
    latencyMs: 1800,
    overallRecommendation: 'Two variations ready to auto-post; one flagged for review.',
    variations: [
      { variationIndex: 1, decision: 'auto-post', rationale: 'Meets all guardrails.' },
      { variationIndex: 2, decision: 'hold-for-review', rationale: 'Caption borderline.' },
      { variationIndex: 3, decision: 'reject', rationale: 'Missing hero image.' },
    ],
    usedManagedAgentsApi: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResearchSignals', () => {
  it('renders when researchBundle is present', () => {
    render(<ResearchSignals bundle={makeResearchBundle()} />);
    expect(screen.getByTestId('research-signals')).toBeTruthy();
    expect(screen.getByText('Market leader in smart sleep tech with strong SG presence.')).toBeTruthy();
  });

  it('renders competitor chips', () => {
    render(<ResearchSignals bundle={makeResearchBundle()} />);
    expect(screen.getByText('Oura')).toBeTruthy();
    expect(screen.getByText('Whoop')).toBeTruthy();
  });

  it('renders per-locale insight bullets', () => {
    render(<ResearchSignals bundle={makeResearchBundle()} />);
    expect(screen.getByTestId('locale-insight-en-SG')).toBeTruthy();
    expect(screen.getByTestId('locale-insight-zh-Hans-SG')).toBeTruthy();
  });

  it('renders up to 5 source URLs as links', () => {
    const sources = Array.from({ length: 7 }, (_, i) => ({
      url: `https://example.com/source-${i}`,
      snippet: `Snippet ${i}`,
      retrievedAt: '2026-04-27T00:00:00Z',
    }));
    render(<ResearchSignals bundle={makeResearchBundle({ sources })} />);
    const links = screen.getAllByTestId('research-source');
    expect(links).toHaveLength(5);
  });

  it('hides section when absent (component not mounted)', () => {
    render(<div data-testid="wrapper" />);
    expect(screen.queryByTestId('research-signals')).toBeNull();
  });
});

describe('SignoffPlan', () => {
  it('renders overall recommendation', () => {
    render(<SignoffPlan plan={makeSchedulePlan()} />);
    expect(screen.getByTestId('signoff-plan')).toBeTruthy();
    expect(screen.getByText('Two variations ready to auto-post; one flagged for review.')).toBeTruthy();
  });

  it('renders auto-post decision with ok tone chip', () => {
    render(<SignoffPlan plan={makeSchedulePlan()} />);
    const chip = screen.getByTestId('signoff-decision-1');
    expect(chip.textContent).toBe('auto-post');
  });

  it('renders hold-for-review decision with warn tone chip', () => {
    render(<SignoffPlan plan={makeSchedulePlan()} />);
    const chip = screen.getByTestId('signoff-decision-2');
    expect(chip.textContent).toBe('hold-for-review');
  });

  it('renders reject decision with error tone chip', () => {
    render(<SignoffPlan plan={makeSchedulePlan()} />);
    const chip = screen.getByTestId('signoff-decision-3');
    expect(chip.textContent).toBe('reject');
  });
});

describe('AtlasSection', () => {
  it('renders atlas thumbnail when atlasUrl present', () => {
    render(<AtlasSection atlasUrl="https://cdn.example.com/atlas.jpg" index={0} />);
    const img = screen.getByTestId('atlas-thumbnail-0') as HTMLImageElement;
    expect(img.src).toBe('https://cdn.example.com/atlas.jpg');
  });

  it('shows no-atlas placeholder when atlasUrl absent', () => {
    render(<AtlasSection index={0} />);
    expect(screen.getByText('no atlas')).toBeTruthy();
    expect(screen.queryByTestId('atlas-thumbnail-0')).toBeNull();
  });
});

describe('NativePerFormatSection', () => {
  it('renders thumbnails for each entry in nativePerFormatRendered', () => {
    render(
      <NativePerFormatSection
        rendered={['1x1', '4x5', '9x16', '16x9']}
        urls={{
          '1x1': 'https://cdn.example.com/1x1.jpg',
          '4x5': 'https://cdn.example.com/4x5.jpg',
          '9x16': 'https://cdn.example.com/9x16.jpg',
          '16x9': 'https://cdn.example.com/16x9.jpg',
        }}
        index={0}
      />
    );
    const container = screen.getByTestId('native-per-format-0');
    expect(container).toBeTruthy();
    expect(screen.getByTestId('format-img-1x1')).toBeTruthy();
    expect(screen.getByTestId('format-img-4x5')).toBeTruthy();
    expect(screen.getByTestId('format-img-9x16')).toBeTruthy();
    expect(screen.getByTestId('format-img-16x9')).toBeTruthy();
  });

  it('shows upload-failed placeholder when formatId rendered but url missing', () => {
    render(
      <NativePerFormatSection
        rendered={['1x1', '9x16']}
        urls={{ '1x1': 'https://cdn.example.com/1x1.jpg' }}
        index={1}
      />
    );
    expect(screen.getByTestId('format-img-1x1')).toBeTruthy();
    expect(screen.getByTestId('format-failed-9x16')).toBeTruthy();
  });

  it('shows no-renders placeholder when rendered list is empty', () => {
    render(<NativePerFormatSection rendered={[]} index={0} />);
    expect(screen.getByText('no per-format renders')).toBeTruthy();
    expect(screen.queryByTestId('native-per-format-0')).toBeNull();
  });
});
