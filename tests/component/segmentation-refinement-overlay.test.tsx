import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmentationRefinementOverlay } from '@/components/canvas/SegmentationRefinementOverlay';

afterEach(cleanup);

function mockBounds(element: HTMLElement, width = 200, height = 100) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      width,
      height,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(element, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(element, 'releasePointerCapture', { value: vi.fn() });
}

describe('SegmentationRefinementOverlay', () => {
  it('maps a click to an image-space foreground point', () => {
    const onAddPoint = vi.fn();

    render(
      <SegmentationRefinementOverlay
        rect={{ x: 0, y: 0, w: 200, h: 100 }}
        imageSize={{ width: 1000, height: 500 }}
        mode="point-fg"
        points={[]}
        onAddPoint={onAddPoint}
        onBoxChange={() => {}}
      />
    );

    const overlay = screen.getByTestId('segmentation-refinement-overlay');
    mockBounds(overlay);

    fireEvent.click(overlay, { clientX: 100, clientY: 50 });

    expect(onAddPoint).toHaveBeenCalledWith({ x: 500, y: 250, label: 'fg' });
  });

  it('renders an existing refinement box in overlay space', () => {
    render(
      <SegmentationRefinementOverlay
        rect={{ x: 0, y: 0, w: 200, h: 100 }}
        imageSize={{ width: 1000, height: 500 }}
        mode={null}
        points={[]}
        box={{ x: 100, y: 50, w: 500, h: 250 }}
        onAddPoint={() => {}}
        onBoxChange={() => {}}
      />
    );

    const overlay = screen.getByTestId('segmentation-refinement-overlay');
    const box = overlay.querySelector('.border-dashed');

    expect(box).toHaveStyle({
      left: '10%',
      top: '10%',
      width: '50%',
      height: '50%',
    });
  });
});
