import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntelligenceTest } from './intelligence-test';
import { QUESTIONS } from './questions';

describe('IntelligenceTest', () => {
  it('requires answers, preserves edits, completes all stages, prints and resets', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<IntelligenceTest />);
    fireEvent.change(screen.getByLabelText(/الاسم في التقرير/), { target: { value: 'أميرة' } });
    fireEvent.click(screen.getByRole('button', { name: /ابدأ تحدي الذكاء/ }));
    expect(screen.getByRole('button', { name: /السؤال التالي/ })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    const options = () =>
      within(screen.getByRole('group', { name: 'اختر إجابة' })).getAllByRole('button');
    fireEvent.click(options()[0]);
    fireEvent.click(screen.getByRole('button', { name: /السؤال التالي/ }));
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(options()[0]).toHaveAttribute('aria-pressed', 'true');
    for (const question of QUESTIONS) {
      fireEvent.click(options()[question.answer]);
      fireEvent.click(screen.getByRole('button', { name: /السؤال التالي|عرض النتيجة والتقرير/ }));
    }
    const report = screen.getAllByRole('article')[0];
    expect(within(report).getByText('أداء متميز')).toBeInTheDocument();
    expect(within(report).getByText(/أميرة/)).toBeInTheDocument();
    expect(document.querySelector('[data-intelligence-print]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /طباعة التقرير/ }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /أعد المحاولة/ }));
    expect(screen.getByRole('button', { name: /السؤال التالي/ })).toBeDisabled();
    expect(document.querySelector('[data-intelligence-print]')).not.toBeInTheDocument();
    print.mockRestore();
  });
});
