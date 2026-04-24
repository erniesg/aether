import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MotionArtifactPreview } from '@/components/canvas/MotionArtifactPreview';

afterEach(cleanup);

describe('MotionArtifactPreview', () => {
  it('shows a compact artifact-first preview with audio provenance', () => {
    render(
      <MotionArtifactPreview
        artifact={{
          id: 'motion_1',
          runId: 'run_1',
          title: 'AI Engineer in Singapore',
          sceneKind: 'text-mask',
          html: '<!doctype html><html><body><audio data-start="0"></audio></body></html>',
          artifactUrl: 'data:text/html,fixture',
          posterUrl: 'data:image/svg+xml,<svg/>',
          provider: 'hyperframes',
          model: 'hyperframes-html-v1',
          durationSec: 4,
          width: 1920,
          height: 1080,
          audioIncluded: true,
          sourceRef: 'data:image/png;base64,aaa',
        }}
      />
    );

    expect(screen.getByRole('region', { name: /motion artifact/i })).toBeInTheDocument();
    expect(screen.getByTitle(/AI Engineer in Singapore/i)).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('<audio')
    );
    expect(screen.getByText(/sound/i)).toBeInTheDocument();
    expect(screen.getByText(/hyperframes/i)).toBeInTheDocument();
    expect(screen.getByTestId('motion-source-ref')).toHaveAttribute(
      'src',
      'data:image/png;base64,aaa'
    );
  });
});
