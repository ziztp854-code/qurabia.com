import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseQuestionBankFilters } from '@/lib/questions/admin-filters';
import { QuestionBankFilters } from './question-bank-filters';

describe('QuestionBankFilters', () => {
  it('renders database categories with real counts and the administrative uncategorized tab', () => {
    render(
      <QuestionBankFilters
        categories={[
          { id: 'cat_geo', name: 'جغرافيا', count: 3662 },
          { id: 'cat_sport', name: 'رياضة', count: 184 },
        ]}
        filters={parseQuestionBankFilters({ category: 'cat_sport' })}
        totalCount={4620}
        uncategorizedCount={0}
      />,
    );

    expect(screen.getByRole('link', { name: 'جغرافيا 3,662' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'رياضة 184' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'بدون تصنيف 0' })).toBeInTheDocument();
    expect(screen.queryByText('الدين الإسلامي')).not.toBeInTheDocument();
  });

  it('keeps the selected category in the search form', () => {
    render(
      <QuestionBankFilters
        categories={[]}
        filters={parseQuestionBankFilters({ category: 'cat_sport', q: 'كأس العالم' })}
        totalCount={10}
        uncategorizedCount={0}
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'بحث في الأسئلة' })).toHaveValue('كأس العالم');
    expect(screen.getByDisplayValue('cat_sport')).toHaveAttribute('name', 'category');
    expect(screen.getByRole('combobox', { name: 'الحالة' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'الصعوبة' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'اللعبة' })).toBeInTheDocument();
  });
});
