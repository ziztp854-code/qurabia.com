import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuoteMasterRoom } from './quote-master-room';

describe('QuoteMasterRoom', () => {
  it('starts an individual challenge without offering a nonfunctional room invitation', () => {
    render(<QuoteMasterRoom />);
    expect(screen.getByText('تحدٍّ فردي')).toBeInTheDocument();
    expect(screen.getByText(/لا تتوفر دعوات اللاعبين/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /انسخ رابط الدعوة/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ اللعبة' }));
    expect(screen.getByRole('button', { name: /التالي|كشف|إجابة/ })).toBeInTheDocument();
  });
});
