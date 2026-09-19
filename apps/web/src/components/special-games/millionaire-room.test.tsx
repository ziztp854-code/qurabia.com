import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MillionaireRoom } from './millionaire-room';

describe('MillionaireRoom', () => {
  it('starts the millionaire run with a visible bank summary', async () => {
    const user = userEvent.setup();
    render(<MillionaireRoom />);

    expect(screen.getByRole('heading', { name: 'من سيربح المليون؟' })).toBeInTheDocument();
    expect(screen.getByText(/سؤالًا/)).toBeInTheDocument();
    expect(screen.getByText('15 مستوى')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ابدأ رحلة المليون' }));

    expect(screen.getByText('السؤال 1 من 15')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'ما الحرف الأول في كلمة «تحدّي»؟' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'خيارات الإجابة' })).toBeInTheDocument();
  });

  it('uses the fifty helper, reveals a correct answer, and advances the ladder', async () => {
    const user = userEvent.setup();
    render(<MillionaireRoom />);

    await user.click(screen.getByRole('button', { name: 'ابدأ رحلة المليون' }));
    await user.click(screen.getByRole('button', { name: 'حذف إجابتين' }));

    expect(screen.getAllByText('محذوف')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /أ ت/ }));

    expect(screen.getByRole('status')).toHaveTextContent('إجابة صحيحة');
    await user.click(screen.getByRole('button', { name: 'السؤال التالي' }));

    expect(screen.getByText('السؤال 2 من 15')).toBeInTheDocument();
  });

  it('finishes with the current safe prize after a wrong answer', async () => {
    const user = userEvent.setup();
    render(<MillionaireRoom />);

    await user.click(screen.getByRole('button', { name: 'ابدأ رحلة المليون' }));
    await user.click(screen.getByRole('button', { name: /ب ح/ }));

    expect(screen.getByRole('status')).toHaveTextContent('إجابة خاطئة');
    await user.click(screen.getByRole('button', { name: 'عرض النتيجة' }));

    expect(screen.getByRole('heading', { name: '0 نقطة' })).toBeInTheDocument();
  });
});
