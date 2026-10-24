import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceMessage, VoiceParticipant, VoiceSnapshot } from '@/lib/voice/types';
import { VoiceChat } from './voice-chat';
import { withLiveMessages } from './voice-live-message';

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
const message = (id: string, createdAt: number): VoiceMessage => ({
  id,
  createdAt,
  userId: me.id,
  name: me.name,
  image: null,
  text: `رسالة ${id}`,
  replyTo: null,
  pinned: false,
  reactions: {},
});

describe('chat transport invariants during typing', () => {
  it('counts new message IDs while scrolled up even when retained history stays at 200', () => {
    const onEvent = vi.fn();
    const history = Array.from({ length: 200 }, (_, index) => message(`old-${index}`, index));
    const view = render(<VoiceChat {...props} messages={history} onEvent={onEvent} />);
    const log = screen.getByRole('log');
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    });
    fireEvent.scroll(log, { target: { scrollTop: 0 } });
    view.rerender(
      <VoiceChat {...props} messages={history.map((entry) => ({ ...entry }))} onEvent={onEvent} />,
    );
    expect(document.querySelector('.v-new-messages')).not.toBeInTheDocument();
    const retained = [...history.slice(1), message('new', 200)];
    view.rerender(<VoiceChat {...props} messages={retained} onEvent={onEvent} />);
    expect(document.querySelector('.v-new-messages')).toHaveTextContent('1');
    view.rerender(
      <VoiceChat {...props} messages={retained.map((entry) => ({ ...entry }))} onEvent={onEvent} />,
    );
    expect(document.querySelector('.v-new-messages')).toHaveTextContent('1');
    fireEvent.click(document.querySelector<HTMLButtonElement>('.v-new-messages')!);
    expect(document.querySelector('.v-new-messages')).not.toBeInTheDocument();
    expect(log.scrollTop).toBe(log.scrollHeight);
  });

  it('updates all 100 characters immediately without dispatching a message or typing event', () => {
    const onEvent = vi.fn();
    render(<VoiceChat {...props} onEvent={onEvent} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    const draft = 'أهلًا hello '.repeat(10).slice(0, 100);
    for (let index = 1; index <= draft.length; index++) {
      const value = draft.slice(0, index);
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
    }
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('dispatches once while awaiting acknowledgement and merges repeated server delivery once', async () => {
    let acknowledge!: () => void;
    const onEvent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const view = render(<VoiceChat {...props} onEvent={onEvent} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    fireEvent.change(input, { target: { value: '  مرحبًا بالمجلس  ' } });
    const send = screen.getByRole('button', { name: 'إرسال الرسالة' });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      type: 'message',
      text: 'مرحبًا بالمجلس',
      requestId: expect.any(String),
    });
    expect(input).toHaveValue('  مرحبًا بالمجلس  ');
    expect(send).toBeDisabled();

    const confirmed = message('confirmed', 2);
    const snapshot = {
      room: { id: 'room', active: true },
      me,
      cursor: 1,
      messages: [],
    } as unknown as VoiceSnapshot;
    const packet = { roomId: 'room', cursor: 2, message: confirmed };
    const merged = withLiveMessages(snapshot, [packet, packet]);
    view.rerender(<VoiceChat {...props} messages={merged.messages} onEvent={onEvent} />);
    expect(screen.getAllByText(confirmed.text)).toHaveLength(1);
    expect(input).toHaveValue('  مرحبًا بالمجلس  ');
    await act(async () => acknowledge());
    await waitFor(() => expect(input).toHaveValue(''));
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it('keeps out-of-order live deliveries chronological, unique and bounded to 200 messages', () => {
    const snapshot = {
      room: { id: 'room', active: true },
      me,
      cursor: 1,
      messages: Array.from({ length: 199 }, (_, index) => message(`old-${index}`, index)),
    } as unknown as VoiceSnapshot;
    const earlier = {
      roomId: 'room',
      cursor: 2,
      message: message('new-a', 200),
    };
    const later = { roomId: 'room', cursor: 3, message: message('new-b', 201) };
    const merged = withLiveMessages(snapshot, [later, earlier, later]);
    expect(merged.messages).toHaveLength(200);
    expect(merged.messages.slice(-2).map((entry) => entry.id)).toEqual(['new-a', 'new-b']);
    expect(new Set(merged.messages.map((entry) => entry.id)).size).toBe(200);
    expect(merged.messages[0].id).toBe('old-1');
    expect(merged.cursor).toBe(1);
  });
});
