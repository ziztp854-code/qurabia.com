import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './overlay';
describe('Dialog focus with a saving profile form', () => {
  it('wraps focus around enabled controls and skips hidden uploads and disabled actions', async () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="تعديل">
        <input aria-label="hidden upload" type="file" tabIndex={-1} />
        <button disabled>حفظ</button>
      </Dialog>,
    );
    const close = screen.getByRole('button', { name: 'إغلاق النافذة' });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
  });
});
