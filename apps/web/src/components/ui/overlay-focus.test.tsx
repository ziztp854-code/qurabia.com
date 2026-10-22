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


it('retains the same dialog when reopened during exit and uses unique labels', async () => {
  const props = { onOpenChange: vi.fn(), title: 'الأولى', children: <button>إجراء</button> };
  const view = render(<Dialog open {...props} />);
  const original = screen.getByRole('dialog', { name: 'الأولى' });
  view.rerender(<Dialog open={false} {...props} />);
  expect(original).toBeInTheDocument();
  view.rerender(<><Dialog open {...props} /><Dialog open title="الثانية" onOpenChange={vi.fn()}>محتوى</Dialog></>);
  expect(screen.getByRole('dialog', { name: 'الأولى' })).toBe(original);
  expect(original.getAttribute('aria-labelledby')).not.toBe(screen.getByRole('dialog', { name: 'الثانية' }).getAttribute('aria-labelledby'));
});
