import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmojiPicker from './emoji-picker';
afterEach(() => vi.unstubAllGlobals());
describe('emoji picker', () => {
  it('contains keyboard focus, closes with Escape, and restores its trigger', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const view = render(<EmojiPicker userId="keyboard-user" onSelect={vi.fn()} close={close} />);
    expect(screen.getByRole('searchbox')).toHaveFocus();
    const dialog = screen.getByRole('dialog');
    const controls = dialog.querySelectorAll<HTMLElement>('button, input');
    const first = controls[0];
    const last = controls[controls.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
  it('keeps Unicode available while catalog loading is pending, and scopes favorites to the account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const onSelect = vi.fn();
    const view = render(<EmojiPicker userId="a" onSelect={onSelect} close={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'تفضيل ضحك' }));
    fireEvent.click(screen.getByRole('button', { name: 'المفضلة' }));
    fireEvent.click(screen.getByRole('button', { name: 'إدراج ضحك' }));
    expect(onSelect).toHaveBeenCalledWith('😂');
    view.unmount();
    render(<EmojiPicker userId="b" onSelect={onSelect} close={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'المفضلة' }));
    expect(screen.queryByRole('button', { name: 'إدراج ضحك' })).toBeNull();
  });
  it('supports search, recent picks, Escape and catalog failure without blocking selections', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const close = vi.fn();
    render(<EmojiPicker userId="search-user" onSelect={vi.fn()} close={close} />);
    await waitFor(() => expect(screen.getByText(/تعذر تحميل الحزم/)).toBeInTheDocument());
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'قهوة' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إدراج قهوة' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'الأخيرة' }));
    expect(screen.getByRole('button', { name: 'إدراج قهوة' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
});
