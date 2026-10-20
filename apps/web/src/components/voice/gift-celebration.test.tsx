import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceMessage } from '@/lib/voice/types';
import { GiftCelebration } from './gift-celebration';
const message: VoiceMessage = {
  id: 'confirmed-gift',
  userId: 'sender',
  name: 'سالم',
  image: null,
  text: 'هدية',
  createdAt: 1,
  replyTo: null,
  pinned: false,
  reactions: {},
  gift: { id: 'rose', recipientId: 'recipient', recipientName: 'أميرة' },
};
afterEach(() => vi.useRealTimers());
describe('confirmed gift celebration', () => {
  it('announces the real sender and recipient, uses the catalog photograph and expires', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<GiftCelebration message={message} visible onDismiss={dismiss} />);
    expect(screen.getByRole('status')).toHaveTextContent('سالم أهدى وردة');
    expect(screen.getByRole('status')).toHaveTextContent('إلى أميرة');
    expect(document.querySelector('[data-gift="rose"]')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3200));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it('can dismiss by touch and does not display a celebration while the room is hidden', () => {
    const dismiss = vi.fn();
    const view = render(<GiftCelebration message={message} visible onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق تأثير الهدية' }));
    expect(dismiss).toHaveBeenCalledOnce();
    view.rerender(<GiftCelebration message={message} visible={false} onDismiss={dismiss} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
