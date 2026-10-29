import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuoteMasterRoom } from './quote-master-room';

describe('QuoteMasterRoom', () => {
  it('starts an individual challenge without offering a nonfunctional room invitation', () => {
    render(<QuoteMasterRoom />);
    expect(screen.getByText('تحدٍّ فردي')).toBeInTheDocument();
    expect(screen.getByText(/كل جهاز يبدأ جولة فردية مستقلة/)).toBeInTheDocument();
    expect(screen.getByLabelText('رمز QR لفتح لعبة من القائل')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /انسخ رابط الدعوة/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ اللعبة' }));
    expect(screen.getByRole('button', { name: /التالي|كشف|إجابة/ })).toBeInTheDocument();
  });
});

it('counts revealing an answer as a missed attempt and ends after three misses', () => {
  render(<QuoteMasterRoom />);
  fireEvent.click(screen.getByRole('button', { name: 'ابدأ اللعبة' }));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    fireEvent.click(screen.getByRole('button', { name: /كشف الإجابة/ }));
    expect(screen.getByText(/الإجابة:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: attempt === 2 ? /النتيجة/ : /السؤال التالي/ }));
  }
  expect(screen.getByText('انتهت الجولة')).toBeInTheDocument();
  expect(screen.getByText(/الرصيد النهائي 0/)).toBeInTheDocument();
});


it('reveals the answer when time runs out and allows the next question', () => {
  vi.useFakeTimers();
  try {
    render(<QuoteMasterRoom />);
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ اللعبة' }));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByText(/الإجابة:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /السؤال التالي/ }));
    expect(screen.getByRole('button', { name: /كشف الإجابة/ })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
