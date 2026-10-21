import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import { VoiceChat } from './voice-chat';

const { renderMemberName } = vi.hoisted(() => ({ renderMemberName: vi.fn() }));
vi.mock('./use-voice-overlay', () => ({ useVoiceMediaQuery: () => false }));
vi.mock('./member-name', () => ({
  MemberName: ({
    name,
    badges,
    identity,
  }: {
    name: string;
    badges?: string[];
    identity?: { accountNumber: number };
  }) => {
    renderMemberName(name);
    return (
      <span data-badges={badges?.join(',')} data-account-number={identity?.accountNumber}>
        {name}
      </span>
    );
  },
}));

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
const message: VoiceMessage = {
  id: 'message-1',
  userId: 'other',
  name: 'ريم',
  image: null,
  text: 'رسالة سابقة',
  createdAt: 1,
  replyTo: null,
  pinned: false,
  reactions: {},
};
const props = {
  messages: [message],
  me,
  enabled: true,
  canModerate: false,
  onProfile: vi.fn(),
  onError: vi.fn(),
  close: vi.fn(),
};

describe('voice chat typing isolation', () => {
  it('skips stable room renders but still applies participant badge changes', () => {
    const onEvent = vi.fn();
    const view = render(<VoiceChat {...props} onEvent={onEvent} />);
    const initialRenders = renderMemberName.mock.calls.length;
    view.rerender(<VoiceChat {...props} onEvent={onEvent} />);
    expect(renderMemberName.mock.calls.length).toBe(initialRenders);
    view.rerender(
      <VoiceChat
        {...props}
        participants={[{ ...me, id: 'other', name: 'ريم', accountBadges: ['owner'] }]}
        onEvent={onEvent}
      />,
    );
    expect(renderMemberName.mock.calls.length).toBe(initialRenders + 1);
    expect(within(screen.getByRole('log')).getByText('ريم')).toHaveAttribute(
      'data-badges',
      'owner',
    );
  });

  it('does not rerender message authors for 100 draft edits or emoji insertion', () => {
    render(<VoiceChat {...props} onEvent={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    const initialRenders = renderMemberName.mock.calls.length;
    for (let length = 1; length <= 100; length++) {
      fireEvent.change(input, { target: { value: 'a'.repeat(length) } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'إضافة رمز تعبيري' }));
    expect(input).toHaveValue(`${'a'.repeat(100)} ✨`);
    expect(renderMemberName.mock.calls.length).toBe(initialRenders);
  });

  it('skips heartbeat object clones but applies edits, reactions, pins, and author display changes', () => {
    const onEvent = vi.fn();
    const author: VoiceParticipant = { ...me, id: 'other', name: 'ريم' };
    const chat = (entry: VoiceMessage, member: VoiceParticipant) => (
      <VoiceChat
        {...props}
        messages={[entry]}
        participants={[member]}
        canModerate
        onEvent={onEvent}
      />
    );
    const view = render(chat(message, author));
    const initialRenders = renderMemberName.mock.calls.length;
    view.rerender(chat({ ...message, reactions: {} }, { ...author, lastSeenAt: 2, muted: false }));
    expect(renderMemberName.mock.calls.length).toBe(initialRenders);

    const edited = { ...message, text: 'الرسالة بعد التعديل' };
    view.rerender(chat(edited, author));
    expect(screen.getByText(edited.text)).toBeInTheDocument();
    const reacted = { ...edited, reactions: { '👍': [me.id] } };
    view.rerender(chat(reacted, author));
    expect(screen.getByRole('button', { name: 'تفاعل 👍، 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const pinned = { ...reacted, pinned: true };
    view.rerender(chat(pinned, author));
    expect(screen.getAllByText(edited.text)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء تثبيت الرسالة' }));
    expect(onEvent).toHaveBeenCalledWith({
      type: 'pin-message',
      messageId: message.id,
      pinned: false,
    });

    const badged: VoiceParticipant = { ...author, accountBadges: ['owner'] };
    view.rerender(chat({ ...pinned }, badged));
    expect(within(screen.getByRole('log')).getByText('ريم')).toHaveAttribute(
      'data-badges',
      'owner',
    );
    const identified: VoiceParticipant = {
      ...badged,
      communityIdentity: {
        userId: author.id,
        accountNumber: 423,
        name: author.name,
        username: null,
        avatarUrl: null,
        badges: [],
        frame: null,
        effect: null,
        primaryBadge: null,
      },
    };
    view.rerender(chat({ ...pinned }, identified));
    expect(within(screen.getByRole('log')).getByText('ريم')).toHaveAttribute(
      'data-account-number',
      '423',
    );
    view.rerender(chat({ ...pinned }, { ...identified, image: '/avatar.png' }));
    expect(document.querySelector('.v-avatar img')?.getAttribute('src')).toMatch(/\/avatar\.png$/);
    expect(renderMemberName.mock.calls.length).toBe(initialRenders + 6);
  });

  it('updates quoted text when the referenced message changes', () => {
    const onEvent = vi.fn();
    const reply = { ...message, id: 'reply', text: 'هذا رد', replyTo: message.id };
    const view = render(<VoiceChat {...props} messages={[message, reply]} onEvent={onEvent} />);
    expect(document.querySelector('blockquote')).toHaveTextContent(message.text);
    view.rerender(
      <VoiceChat
        {...props}
        messages={[{ ...message, text: 'النص المحدّث للاقتباس' }, { ...reply }]}
        onEvent={onEvent}
      />,
    );
    expect(document.querySelector('blockquote')).toHaveTextContent('النص المحدّث للاقتباس');
  });

  it('keeps Arabic composition local and sends the selected reply after it finishes', async () => {
    const onEvent = vi.fn().mockResolvedValue(undefined);
    render(<VoiceChat {...props} onEvent={onEvent} />);
    fireEvent.click(screen.getByRole('button', { name: 'الرد على ريم' }));
    const input = screen.getByRole('textbox', { name: 'رسالتك' });
    const initialRenders = renderMemberName.mock.calls.length;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'أهلًا\nرسالة عربية طويلة أثناء البث' } });
    fireEvent.compositionEnd(input, { data: 'البث' });
    expect(input).toHaveValue('أهلًا\nرسالة عربية طويلة أثناء البث');
    expect(renderMemberName.mock.calls.length).toBe(initialRenders);
    expect(onEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(onEvent).toHaveBeenCalledExactlyOnceWith({
      type: 'message',
      text: 'أهلًا\nرسالة عربية طويلة أثناء البث',
      replyTo: 'message-1',
    });
    expect(screen.queryByRole('button', { name: 'إلغاء الرد' })).not.toBeInTheDocument();
  });

  it('preserves the draft, focused textarea, and caret through messages and participant updates', () => {
    const onEvent = vi.fn();
    const view = render(<VoiceChat {...props} onEvent={onEvent} />);
    const input = screen.getByRole('textbox', { name: 'رسالتك' }) as HTMLTextAreaElement;
    const draft = 'هذه مسودة عربية طويلة أثناء تحديث المشاركين والرسائل. '.repeat(10);
    fireEvent.change(input, { target: { value: draft } });
    input.focus();
    input.setSelectionRange(5, 12);
    view.rerender(
      <VoiceChat
        {...props}
        messages={[message, { ...message, id: 'message-2', text: 'رسالة واردة جديدة' }]}
        participants={[{ ...me, muted: false, seatIndex: 0, role: 'speaker' }]}
        me={{ ...me, muted: false, seatIndex: 0, role: 'speaker' }}
        onEvent={onEvent}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'رسالتك' })).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue(draft);
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(12);
    expect(screen.getByText('رسالة واردة جديدة')).toBeInTheDocument();
    expect(onEvent).not.toHaveBeenCalled();
  });
});
