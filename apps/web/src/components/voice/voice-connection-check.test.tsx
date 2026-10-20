import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceConnectionCheck } from './voice-connection-check';
import type { VoiceCheckRow } from './voice-connection-report';

describe('connection check controls', () => {
  it('waits for an explicit click, guards repeat clicks and announces actual findings', async () => {
    let finish!: (rows: VoiceCheckRow[]) => void;
    const inspect = vi.fn(
      () =>
        new Promise<VoiceCheckRow[]>((resolve) => {
          finish = resolve;
        }),
    );
    render(<VoiceConnectionCheck inspect={inspect} />);
    expect(inspect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'فحص اتصال الغرفة' }));
    expect(screen.getByRole('button', { name: 'جارٍ فحص الاتصال…' })).toBeDisabled();
    finish([{ label: 'اتصال الغرفة', state: 'failed', detail: 'الصوت غير متصل.' }]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('الصوت غير متصل.'));
    expect(inspect).toHaveBeenCalledTimes(1);
  });
  it('recovers from a failed check and allows retry', async () => {
    render(<VoiceConnectionCheck inspect={vi.fn().mockRejectedValue(new Error('SDK'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'فحص اتصال الغرفة' }));
    expect(await screen.findByText('تعذر إتمام الفحص. حاول مجددًا.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'فحص اتصال الغرفة' })).toBeEnabled();
  });
});
