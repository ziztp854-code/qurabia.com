import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import { VoiceChat, createVoiceChatDraft } from './voice-chat';

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
    expect(onEvent.mock.calls[1][0].requestId).toBe(onEvent.mock.calls[0][0].requestId);
  });
  it('keeps typing, focus and caret during acknowledgement without allowing a second in-flight send', async () => {
    let acknowledge!: () => void;
    const onEvent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    render(<VoiceChat {...props} onEvent={onEvent} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'الرسالة الأولى' } });
    const send = screen.getByRole('button', { name: 'إرسال الرسالة' });
    send.focus();
    fireEvent.click(send);
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'إرسال الرسالة' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'مسودة جديدة' } });
    input.setSelectionRange(2, 4);
    fireEvent.submit(input.closest('form')!);
    expect(onEvent).toHaveBeenCalledOnce();
    await act(async () => acknowledge());
    expect(input).toHaveValue('مسودة جديدة');
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(4);
    expect(screen.getByRole('button', { name: 'إرسال الرسالة' })).toBeEnabled();
  });

  it('preserves a new draft after failure and assigns a new request ID to the changed payload', async () => {
    let reject!: (error: Error) => void;
    const onEvent = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValueOnce(undefined);
    render(<VoiceChat {...props} onEvent={onEvent} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    fireEvent.change(input, { target: { value: 'الأولى' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.change(input, { target: { value: 'رسالة معدلة' } });
    await act(async () => reject(new Error('حاول مجددًا')));
    expect(input).toHaveValue('رسالة معدلة');
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(input).toHaveValue(''));
    expect(onEvent.mock.calls[1][0].text).toBe('رسالة معدلة');
    expect(onEvent.mock.calls[1][0].requestId).not.toBe(onEvent.mock.calls[0][0].requestId);
  });

  it.each(['success', 'failure'])(
    'preserves edited emoji drafts and a newly selected reply after %s',
    async (outcome) => {
      let acknowledge!: () => void;
      const onEvent = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve, reject) => {
              acknowledge = () =>
                outcome === 'success' ? resolve() : reject(new Error('حاول مجددًا'));
            }),
        )
        .mockResolvedValueOnce(undefined);
      const messages: VoiceMessage[] = ['أول', 'ثان'].map((name, index) => ({
        id: `message-${index}`,
        userId: `user-${index}`,
        name,
        image: null,
        text: name,
        createdAt: index + 1,
        replyTo: null,
        pinned: false,
        reactions: {},
      }));
      render(<VoiceChat {...props} messages={messages} onEvent={onEvent} />);
      fireEvent.click(screen.getByRole('button', { name: 'الرد على أول' }));
      const input = screen.getByRole('textbox', { name: 'رسالتك' });
      fireEvent.change(input, { target: { value: 'رد أول' } });
      fireEvent.submit(input.closest('form')!);
      fireEvent.click(screen.getByRole('button', { name: 'الرد على ثان' }));
      fireEvent.change(input, { target: { value: 'رد آخر' } });
      fireEvent.click(screen.getByRole('button', { name: 'إضافة رمز تعبيري' }));
      fireEvent.click(await screen.findByRole('button', { name: 'إدراج بريق' }));
      const draft = (input as HTMLTextAreaElement).value;
      await act(async () => acknowledge());
      expect(input).toHaveValue(draft);
      expect(draft).not.toBe('رد آخر');
      expect(document.querySelector('.v-reply-preview')).toHaveTextContent('ثان');
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(input).toHaveValue(''));
      expect(onEvent.mock.calls[0][0].replyTo).toBe('message-0');
      expect(onEvent.mock.calls[1][0].replyTo).toBe('message-1');
    },
  );

  it('does not clear a different reply selected during acknowledgement even if its text was unchanged', async () => {
    let acknowledge!: () => void;
    const onEvent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const entry: VoiceMessage = {
      id: 'new-reply',
      userId: 'other',
      name: 'سارة',
      image: null,
      text: 'سؤال',
      createdAt: 1,
      replyTo: null,
      pinned: false,
      reactions: {},
    };
    render(<VoiceChat {...props} messages={[entry]} onEvent={onEvent} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    fireEvent.change(input, { target: { value: 'رسالة مستقلة' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: 'الرد على سارة' }));
    await act(async () => acknowledge());
    expect(input).toHaveValue('');
    expect(document.querySelector('.v-reply-preview')).toHaveTextContent('سارة');
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

describe('composer session continuity', () => {
  it('retains draft and retry identity through rejoin remount', async () => {
    const draft = createVoiceChatDraft();
    const onError = vi.fn();
    const onEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost ACK'))
      .mockResolvedValueOnce(undefined);
    const first = render(
      <VoiceChat {...props} draft={draft} onEvent={onEvent} onError={onError} />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'رسالتك' }), {
      target: { value: 'لا تضيع رسالتي' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    first.unmount();
    render(<VoiceChat {...props} draft={draft} onEvent={onEvent} />);
    expect(screen.getByRole('textbox', { name: 'رسالتك' })).toHaveValue('لا تضيع رسالتي');
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'رسالتك' })).toHaveValue(''));
    expect(onEvent.mock.calls[1][0].requestId).toBe(onEvent.mock.calls[0][0].requestId);
  });
  it('protects newer text across remount and ignores late ACK after reset', async () => {
    const draft = createVoiceChatDraft();
    let acknowledge!: () => void;
    const onEvent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const first = render(<VoiceChat {...props} draft={draft} onEvent={onEvent} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'رسالتك' }), {
      target: { value: 'الأولى' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    first.unmount();
    render(<VoiceChat {...props} draft={draft} onEvent={onEvent} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'رسالتك' }), {
      target: { value: 'الأحدث' },
    });
    await act(async () => acknowledge());
    expect(screen.getByRole('textbox', { name: 'رسالتك' })).toHaveValue('الأحدث');
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    act(() => draft.reset());
    await act(async () => acknowledge());
    expect(screen.getByRole('textbox', { name: 'رسالتك' })).toHaveValue('');
    expect(draft.getSnapshot().pending).toBeNull();
  });
});
