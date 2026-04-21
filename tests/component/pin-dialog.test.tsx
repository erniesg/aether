import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinDialog } from '@/components/capability/PinDialog';
import type { CapabilityRunRecord } from '@/lib/store/runs';

const run: CapabilityRunRecord = {
  id: 'run_1',
  tool: 'image-gen',
  provider: 'gemini',
  model: 'gemini-2.5-flash-image',
  prompt: 'recolor to brand palette',
  rewrittenPrompt: 'a portrait recolored to the brand palette',
  aspectRatio: '1:1',
  status: 'ok',
  startedAt: 1,
  finishedAt: 2,
};

const proposal = {
  name: 'recolor to brand palette',
  trigger: 'recolor the selected layer using the pinned brand palette',
  paramSchema: { type: 'object', properties: { layerId: { type: 'string' } }, required: ['layerId'] },
  notes: 'anchors to pinned brand tokens',
};

beforeEach(() => {
  const mockFetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ ok: true, proposal }),
  }));
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PinDialog', () => {
  it('fetches a proposal and renders editable name + trigger', async () => {
    render(<PinDialog run={run} open onAccept={() => {}} onReject={() => {}} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(proposal.name)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(proposal.trigger)).toBeInTheDocument();
  });

  it('invokes onAccept with the (possibly edited) proposal', async () => {
    const onAccept = vi.fn();
    render(<PinDialog run={run} open onAccept={onAccept} onReject={() => {}} />);

    const nameInput = await screen.findByDisplayValue(proposal.name);
    fireEvent.change(nameInput, { target: { value: 'tighten to brand' } });

    const accept = screen.getByRole('button', { name: /pin skill/i });
    await userEvent.click(accept);

    await waitFor(() => expect(onAccept).toHaveBeenCalled());
    const arg = onAccept.mock.calls[0][0];
    expect(arg.name).toBe('tighten to brand');
    expect(arg.trigger).toBe(proposal.trigger);
  });

  it('invokes onReject when the user cancels', async () => {
    const onReject = vi.fn();
    render(<PinDialog run={run} open onAccept={() => {}} onReject={onReject} />);

    await screen.findByDisplayValue(proposal.name);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onReject).toHaveBeenCalled();
  });
});
