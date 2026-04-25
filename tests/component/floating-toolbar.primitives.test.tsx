import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FloatingToolbar,
  type ToolbarStyleAction,
} from '@/components/canvas/FloatingToolbar';
import type { PrimitiveTool } from '@/lib/canvas/sketchBrush';

afterEach(cleanup);

describe('FloatingToolbar · creator-owned primitives', () => {
  it('exposes sketch controls alongside the minimal primitive subset when native tldraw chrome is hidden', () => {
    render(<FloatingToolbar />);

    expect(screen.getByRole('button', { name: /select tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hand tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sketch tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /text tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shape tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /arrow tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear canvas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ink black/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ink white/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ink blue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /brand primary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /brand accent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /brush size small/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /brush size medium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /brush size large/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fill solid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fill none/i })).toBeInTheDocument();
  });

  it('dispatches primitive tool and style actions through dedicated callbacks', async () => {
    const onPrimitiveToolPress = vi.fn<(tool: PrimitiveTool) => void>();
    const onStyleAction = vi.fn<(action: ToolbarStyleAction) => void>();
    const onClearCanvas = vi.fn();

    render(
      <FloatingToolbar
        onPrimitiveToolPress={onPrimitiveToolPress}
        onStyleAction={onStyleAction}
        onClearCanvas={onClearCanvas}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /select tool/i }));
    await userEvent.click(screen.getByRole('button', { name: /sketch tool/i }));
    await userEvent.click(screen.getByRole('button', { name: /text tool/i }));
    await userEvent.click(screen.getByRole('button', { name: /arrow tool/i }));
    await userEvent.click(screen.getByRole('button', { name: /clear canvas/i }));
    await userEvent.click(screen.getByRole('button', { name: /fill solid/i }));
    await userEvent.click(screen.getByRole('button', { name: /brand accent/i }));
    await userEvent.click(screen.getByRole('button', { name: /brush size large/i }));

    expect(onPrimitiveToolPress.mock.calls.map(([tool]) => tool)).toEqual([
      'select',
      'draw',
      'text',
      'arrow',
    ]);
    expect(onStyleAction.mock.calls.map(([action]) => action)).toEqual([
      'fill-solid',
      'color-brand-accent',
      'size-large',
    ]);
    expect(onClearCanvas).toHaveBeenCalledTimes(1);
  });

  it('reflects shared brush state in the active sketch controls', () => {
    render(
      <FloatingToolbar
        activePrimitiveTool="draw"
        brushState={{ color: 'brand-accent', size: 'large' }}
      />
    );

    expect(screen.getByRole('button', { name: /sketch tool/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /brand accent/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /brush size large/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
