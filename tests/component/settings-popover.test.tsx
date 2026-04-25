/**
 * SettingsPopover component tests.
 *
 * Covers:
 * - Opens on chip click
 * - Persists changes via onSave callback
 * - Shows "saved" indicator after save
 * - Closes on outside click (via Escape key and backdrop)
 * - Dropdown options reflect available providers only
 * - Model field appears only for gemini-live voice selection
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPopover } from '@/components/workspace/SettingsPopover';
import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';

afterEach(cleanup);

const DEFAULT_PREFS: WorkspaceProviderPrefs = {};

describe('SettingsPopover', () => {
  it('renders a settings chip trigger button', () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /settings/i })
    ).toBeInTheDocument();
  });

  it('popover is closed by default', () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens popover on chip click', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('popover fits within 300×220px constraint (width class)', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    const dialog = screen.getByRole('dialog');
    // The popover must declare a max-width constraint
    expect(dialog.className).toMatch(/w-\[|max-w-/);
  });

  it('shows three provider rows: voice, image, segmentation', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByLabelText(/voice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/image/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/segmentation/i)).toBeInTheDocument();
  });

  it('calls onSave with updated prefs when a voice dropdown changes', async () => {
    const onSave = vi.fn();
    render(
      <SettingsPopover
        prefs={{ voiceProviderId: 'gemini-live' }}
        onSave={onSave}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    const voiceSelect = screen.getByLabelText(/voice/i) as HTMLSelectElement;
    await userEvent.selectOptions(voiceSelect, 'openai-realtime');

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ voiceProviderId: 'openai-realtime' })
      );
    });
  });

  it('calls onSave with updated prefs when image dropdown changes', async () => {
    const onSave = vi.fn();
    render(
      <SettingsPopover
        prefs={{ imageProviderId: 'openai' }}
        onSave={onSave}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    const imageSelect = screen.getByLabelText(/image/i) as HTMLSelectElement;
    await userEvent.selectOptions(imageSelect, 'gemini');

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ imageProviderId: 'gemini' })
      );
    });
  });

  it('shows model input when gemini-live is the voice provider', async () => {
    render(
      <SettingsPopover
        prefs={{ voiceProviderId: 'gemini-live', voiceModel: 'gemini-3.1-flash-live-preview' }}
        onSave={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/model/i)).toHaveValue('gemini-3.1-flash-live-preview');
  });

  it('hides model input when openai-realtime is the voice provider', async () => {
    render(
      <SettingsPopover
        prefs={{ voiceProviderId: 'openai-realtime' }}
        onSave={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.queryByLabelText(/model/i)).not.toBeInTheDocument();
  });

  it('shows a "saved" indicator after onSave resolves', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsPopover
        prefs={{ voiceProviderId: 'gemini-live' }}
        onSave={onSave}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    const voiceSelect = screen.getByLabelText(/voice/i);
    await userEvent.selectOptions(voiceSelect, 'openai-realtime');

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
  });

  it('closes on Escape key', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes when clicking the backdrop', async () => {
    render(
      <div>
        <SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('outside'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('voice dropdown includes gemini-live and openai-realtime options', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    const voiceSelect = screen.getByLabelText(/voice/i) as HTMLSelectElement;
    const options = Array.from(voiceSelect.options).map((o) => o.value);
    expect(options).toContain('gemini-live');
    expect(options).toContain('openai-realtime');
  });

  it('image dropdown includes openai, gemini, replicate, volcengine options', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    const imageSelect = screen.getByLabelText(/image/i) as HTMLSelectElement;
    const options = Array.from(imageSelect.options).map((o) => o.value);
    expect(options).toContain('openai');
    expect(options).toContain('gemini');
    expect(options).toContain('replicate');
    expect(options).toContain('volcengine');
  });

  it('segmentation dropdown includes sam3 and sam2 options', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    const segSelect = screen.getByLabelText(/segmentation/i) as HTMLSelectElement;
    const options = Array.from(segSelect.options).map((o) => o.value);
    expect(options).toContain('sam3');
    expect(options).toContain('sam2');
  });

  it('reflects initialised prefs in the dropdowns', async () => {
    render(
      <SettingsPopover
        prefs={{
          voiceProviderId: 'openai-realtime',
          imageProviderId: 'replicate',
          segmentationProviderId: 'sam2',
        }}
        onSave={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    expect(screen.getByLabelText<HTMLSelectElement>(/voice/i).value).toBe('openai-realtime');
    expect(screen.getByLabelText<HTMLSelectElement>(/image/i).value).toBe('replicate');
    expect(screen.getByLabelText<HTMLSelectElement>(/segmentation/i).value).toBe('sam2');
  });

  it('does not expose API key fields', async () => {
    render(<SettingsPopover prefs={DEFAULT_PREFS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.queryByLabelText(/api.key/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/sk-/i)).not.toBeInTheDocument();
  });
});
