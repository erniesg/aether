import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillAcceptDialog } from '@/components/capability/SkillAcceptDialog';

const manifest = {
  name: 'neon-drench',
  version: 1,
  description: 'Drench an image in neon light wash.',
  tools: ['image_edit'],
  referenceFiles: [],
  instructions:
    '# neon-drench\n\nApply a neon wash.\n\n## Output format\n\n```json\n{ "ok": true, "result": {} }\n```',
};

beforeEach(() => {
  const mockFetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ ok: true, manifest }),
  }));
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SkillAcceptDialog', () => {
  it('fetches a draft and renders the manifest', async () => {
    render(
      <SkillAcceptDialog
        pendingPrompt="write a skill that neon-drenches any image"
        onAccept={() => {}}
        onReject={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('skill-accept-name')).toHaveValue('neon-drench');
    });
    expect(screen.getByTestId('skill-accept-description')).toHaveTextContent(
      /neon light wash/i
    );
  });

  it('toggles the instructions body on demand', async () => {
    render(
      <SkillAcceptDialog
        pendingPrompt="write a skill that neon-drenches any image"
        onAccept={() => {}}
        onReject={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('skill-accept-name')).toHaveValue('neon-drench');
    });
    // Instructions body is hidden by default.
    expect(screen.queryByTestId('skill-accept-instructions')).toBeNull();
    await userEvent.click(screen.getByTestId('skill-accept-toggle-instructions'));
    expect(screen.getByTestId('skill-accept-instructions')).toHaveTextContent(/Output format/);
  });

  it('passes the (possibly renamed) manifest to onAccept', async () => {
    const onAccept = vi.fn();
    render(
      <SkillAcceptDialog
        pendingPrompt="write a skill that neon-drenches any image"
        onAccept={onAccept}
        onReject={() => {}}
      />
    );

    const nameInput = await screen.findByTestId('skill-accept-name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'neon-wash');

    await userEvent.click(screen.getByTestId('skill-accept-confirm'));

    await waitFor(() => expect(onAccept).toHaveBeenCalled());
    expect(onAccept.mock.calls[0][0].name).toBe('neon-wash');
  });

  it('invokes onReject when the user cancels', async () => {
    const onReject = vi.fn();
    render(
      <SkillAcceptDialog
        pendingPrompt="write a skill that neon-drenches any image"
        onAccept={() => {}}
        onReject={onReject}
      />
    );

    await screen.findByTestId('skill-accept-name');
    await userEvent.click(screen.getByTestId('skill-accept-reject'));
    expect(onReject).toHaveBeenCalled();
  });
});
