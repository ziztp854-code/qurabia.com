import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import { GiftReceipt, VoiceGifts } from './voice-gifts';

const self: VoiceParticipant = {
  id: 'self',
  name: 'سالم',
  image: null,
  role: 'host',
  seatIndex: 0,
  handRaised: false,
  requestedSeat: null,
  muted: false,
  moderatorMuted: false,
  joinedAt: 1,
  lastSeenAt: 1,
};
const other: VoiceParticipant = {
  ...self,
  id: 'other',
  name: 'أميرة',
  role: 'listener',
  seatIndex: null,
};
const base = { participants: [self, other], selfId: self.id, enabled: true, onClose: vi.fn() };

describe('trial gift interface', () => {
  it('sends the selected catalog gift to the selected member and confirms only after success', async () => {
    let confirm!: () => void;
    const onEvent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          confirm = resolve;
        }),
    );
    const onClose = vi.fn();
    render(<VoiceGifts {...base} onEvent={onEvent} onClose={onClose} />);
    expect(screen.getByText(/دون شراء أو خصم رصيد/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /تاج/ }));
    fireEvent.click(screen.getByRole('button', { name: 'إرسال تاج مجانًا' }));
    await waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith({
        type: 'gift',
        giftId: 'crown',
        recipientId: 'other',
        requestId: expect.any(String),
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'جارٍ الإرسال…' })).toBeDisabled();
    confirm();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
  it('supports trying a gift alone and never reports a rejected request as success', async () => {
    const onEvent = vi.fn(async () => {
      throw new Error('انتظر خمس ثوانٍ بين الهدايا التجريبية.');
    });
    const onClose = vi.fn();
    render(<VoiceGifts {...base} participants={[self]} onEvent={onEvent} onClose={onClose} />);
    expect(screen.getByRole('combobox')).toHaveValue('self');
    fireEvent.click(screen.getByRole('button', { name: 'إرسال وردة مجانًا' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('انتظر خمس ثوانٍ');
    expect(screen.queryByText(/أُرسلت/)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'إرسال وردة مجانًا' })).toBeEnabled();
  });
  it('disables sending when the selected recipient leaves or chat becomes unavailable', () => {
    const onEvent = vi.fn();
    const { rerender } = render(
      <VoiceGifts {...base} onEvent={onEvent} initialRecipientId="other" />,
    );
    rerender(<VoiceGifts {...base} participants={[self]} onEvent={onEvent} />);
    expect(screen.getByRole('button', { name: 'إرسال وردة مجانًا' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'self' } });
    expect(screen.getByRole('button', { name: 'إرسال وردة مجانًا' })).toBeEnabled();
    rerender(<VoiceGifts {...base} enabled={false} onEvent={onEvent} />);
    expect(screen.getByRole('button', { name: 'إرسال وردة مجانًا' })).toBeDisabled();
    expect(onEvent).not.toHaveBeenCalled();
  });
  it('renders the receipt as text with an explicit trial label', () => {
    const message: VoiceMessage = {
      id: 'gift',
      userId: self.id,
      name: '<b>سالم</b>',
      image: null,
      text: 'هدية',
      createdAt: 1,
      replyTo: null,
      pinned: false,
      reactions: {},
      gift: { id: 'star', recipientId: other.id, recipientName: other.name },
    };
    const { container } = render(<GiftReceipt message={message} />);
    expect(screen.getByText('هدية نجمة')).toBeInTheDocument();
    expect(screen.getByText('هدية تجريبية مجانية')).toBeInTheDocument();
    expect(screen.getByText('<b>سالم</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });
});
