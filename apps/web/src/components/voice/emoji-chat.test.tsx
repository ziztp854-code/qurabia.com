import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceParticipant, VoiceMessage } from '@/lib/voice/types';
import { VoiceChat } from './voice-chat';
vi.mock('./use-voice-overlay', () => ({ useVoiceMediaQuery: () => false }));
const me: VoiceParticipant = {
  id: 'self',
  name: 'عزيز',
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
afterEach(() => vi.unstubAllGlobals());
describe('chat emoji integration', () => {
  it('keeps a 200-message history mounted while 100 draft updates are dispatched locally', () => {
    const messages: VoiceMessage[] = Array.from({ length: 200 }, (_, index) => ({
      id: `crowd-${index}`,
      userId: `member-${index % 20}`,
      name: `عضو ${index % 20}`,
      image: null,
      text: 'أهلا 😂 👏',
      createdAt: 1800000000000 + index,
      replyTo: null,
      pinned: false,
      reactions: {},
    }));
    const onEvent = vi.fn();
    render(<VoiceChat {...props} messages={messages} onEvent={onEvent} />);
    const first = screen.getByRole('log').querySelector('article');
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    const start = performance.now();
    for (let index = 1; index <= 100; index++)
      fireEvent.change(input, { target: { value: 'س'.repeat(index) } });
    console.info('crowded-jsdom-100-draft-edits-ms', Math.round(performance.now() - start));
    expect(screen.getByRole('log').querySelectorAll('article')).toHaveLength(200);
    expect(screen.getByRole('log').querySelector('article')).toBe(first);
    expect(onEvent).not.toHaveBeenCalled();
  });
  it('inserts at the selection without waiting for a pending asset catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const onEvent = vi.fn().mockResolvedValue(undefined);
    render(<VoiceChat {...props} onEvent={onEvent} />);
    const input = screen.getByRole('textbox', {
      name: 'رسالتك',
    }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'أهلا يا صديق' } });
    input.setSelectionRange(5, 7);
    fireEvent.click(screen.getByRole('button', { name: 'إضافة رمز تعبيري' }));
    fireEvent.click(await screen.findByRole('button', { name: 'إدراج ضحك' }));
    expect(input).toHaveValue('أهلا 😂 صديق');
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      type: 'message',
      text: 'أهلا 😂 صديق',
      requestId: expect.any(String),
    });
  });
  it('reuses the same request ID after a failed acknowledgement', async () => {
    const onEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(undefined);
    render(<VoiceChat {...props} onEvent={onEvent} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'رسالتك' }), {
      target: { value: 'هلا 😂' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith('timeout'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'إرسال الرسالة' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    expect(onEvent.mock.calls[0][0].requestId).toBe(onEvent.mock.calls[1][0].requestId);
  });
});
