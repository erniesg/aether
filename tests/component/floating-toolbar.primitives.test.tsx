import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FloatingToolbar,
  type PrimitiveTool,
  type ToolbarStyleAction,
} from '@/components/canvas/FloatingToolbar';

afterEach(cleanup);

describe('FloatingToolbar · creator-owned primitives', () => {
  it('exposes a minimal primitive and style subset when native tldraw chrome is hidden', () => {
    render(<FloatingToolbar />);

    expect(screen.getByRole('button', { name: /select tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hand tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /text tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shape tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /arrow tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ink style/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accent style/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fill solid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fill none/i })).toBeInTheDocument();
  });

  it('dispatches primitive tool and style actions through dedicated callbacks', async () => {
    const onPrimitiveToolPress = vi.fn<(tool: PrimitiveTool) => void>();
    const onStyleAction = vi.fn<(action: ToolbarStyleAction) => void>();

    render(
      <FloatingToolbar
        onPrimitiveToolPress={onPrimitiveToolPress}
        onStyleAction={onStyleAction}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /select tool/i }));
    await userEvent.click(screen.getByRole('button', { name: /text tool/i }));
    await userEvent.click(screen.getByRole('button', { name: /arrow tool/i }));
    await userEvent.click(screen.getByRole('button', { name: /fill solid/i }));
    await userEvent.click(screen.getByRole('button', { name: /accent style/i }));

    expect(onPrimitiveToolPress.mock.calls.map(([tool]) => tool)).toEqual([
      'select',
      'text',
      'arrow',
    ]);
    expect(onStyleAction.mock.calls.map(([action]) => action)).toEqual([
      'fill-solid',
      'color-blue',
    ]);
  });
});
