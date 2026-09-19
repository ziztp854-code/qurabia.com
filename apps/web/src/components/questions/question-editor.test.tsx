import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionEditor } from './question-editor';

vi.mock('@/app/questions/actions', () => ({
  createQuestion: vi.fn().mockResolvedValue({ status: 'success', message: 'تم الحفظ.' }),
}));

const categories = [
  { id: 'cat-science', name: 'علوم' },
  { id: 'cat-space', name: 'فضاء' },
  { id: 'cat-saudi-history', name: 'تاريخ السعودية' },
];

describe('QuestionEditor', () => {
  it('groups editor fields into question, options, and settings sections', () => {
    render(<QuestionEditor categories={categories} />);
    expect(screen.getByRole('group', { name: 'الخيارات والإجابة الصحيحة' })).toBeInTheDocument();
    expect(screen.getByLabelText('نص السؤال')).toBeInTheDocument();
    expect(screen.getByLabelText('الصعوبة')).toBeInTheDocument();
    expect(screen.getByLabelText('الوقت بالثواني')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ كمسودة' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'التصنيف والإعدادات' })).toBeInTheDocument();
  });

  it('does not expose the retired AI question assistant', () => {
    render(<QuestionEditor categories={categories} />);

    expect(screen.queryByRole('heading', { name: 'مساعد صياغة السؤال' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('موضوع السؤال')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /توليد/ })).not.toBeInTheDocument();
  });

  it('keeps true/false choices in the fixed editable contract', async () => {
    const user = userEvent.setup();
    render(<QuestionEditor categories={categories} />);

    await user.selectOptions(screen.getByLabelText('نوع السؤال'), 'TRUE_FALSE');

    expect(screen.getByDisplayValue('صح')).toBeInTheDocument();
    expect(screen.getByDisplayValue('خطأ')).toBeInTheDocument();
    expect(screen.getByLabelText('نص السؤال')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ كمسودة' })).toBeInTheDocument();
  });

  it('creates a one-word answer for كلمة وسؤال', async () => {
    const user = userEvent.setup();
    render(<QuestionEditor categories={categories} />);

    await user.selectOptions(screen.getByLabelText('نوع السؤال'), 'SHORT_ANSWER');

    expect(screen.getByLabelText('الإجابة بكلمة واحدة')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'الخيارات والإجابة الصحيحة' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'كلمة وسؤال' })).toBeInTheDocument();
  });

  it('allows adding and removing multiple-choice options', async () => {
    const user = userEvent.setup();
    render(<QuestionEditor categories={categories} />);

    expect(screen.getAllByPlaceholderText(/الخيار/).length).toBe(4);
    await user.click(screen.getByRole('button', { name: 'إضافة خيار' }));
    expect(screen.getAllByPlaceholderText(/الخيار/).length).toBe(5);
    await user.click(screen.getByRole('button', { name: 'حذف خيار' }));
    expect(screen.getAllByPlaceholderText(/الخيار/).length).toBe(4);
  });
});
