import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceParticipant } from '@/lib/voice/types';
import { VoiceChat } from './voice-chat';

vi.mock('./use-voice-overlay', () => ({ useVoiceMediaQuery: () => false }));
const me: VoiceParticipant = {
  id: 'self',
  name: 'سالم',
  image: null,
  role: 'listener',
  seatIndex: null,
  handRaised: false,
  requestedSeat: null,
  muted: true,
  moderatorMuted: false,
  joinedAt: 1,
  lastSeenAt: 1,
};
const props = {
  messages: [],
  me,
  enabled: true,
  canModerate: false,
  onProfile: vi.fn(),
  onError: vi.fn(),
  close: vi.fn(),
};

describe('room composer', () => {
  it('keeps multiline drafts after a failed send and clears them only after success', async () => {
    const onError = vi.fn();
    const onEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('حاول مجددًا'))
      .mockResolvedValueOnce(undefined);
    render(<VoiceChat {...props} onEvent={onEvent} onError={onError} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    fireEvent.change(input, { target: { value: 'أهلًا\nكيف الحال؟' } });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('حاول مجددًا'));
    expect(input).toHaveValue('أهلًا\nكيف الحال؟');
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(onEvent).toHaveBeenLastCalledWith({
      type: 'message',
      text: 'أهلًا\nكيف الحال؟',
      requestId: expect.any(String),
    });
  });
  it('opens gifts without submitting or losing the draft and respects membership', () => {
    const onGift = vi.fn();
    const onEvent = vi.fn();
    const view = render(<VoiceChat {...props} onEvent={onEvent} onGift={onGift} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'رسالتك' }), {
      target: { value: 'مسودة' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال هدية' }));
    expect(onGift).toHaveBeenCalledOnce();
    expect(onEvent).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'رسالتك' })).toHaveValue('مسودة');
    view.rerender(<VoiceChat {...props} me={null} onEvent={onEvent} onGift={onGift} />);
    expect(screen.getByRole('button', { name: 'إرسال هدية' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'إرسال الرسالة' })).toBeDisabled();
  });
});
