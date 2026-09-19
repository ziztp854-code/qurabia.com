import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionBankIndex, QuestionBankStats } from './question-bank-index';

describe('QuestionBankIndex', () => {
  const mockCategories = [
    { id: 'cat1', name: 'ثقافة إسلامية', _count: { questions: 25 } },
    { id: 'cat2', name: 'جغرافيا', _count: { questions: 150 } },
    { id: 'cat3', name: 'تاريخ', _count: { questions: 80 } },
    { id: 'cat4', name: 'علوم', _count: { questions: 45 } },
    { id: 'cat5', name: 'أدب ولغة', _count: { questions: 60 } },
    { id: 'cat6', name: 'رياضة', _count: { questions: 30 } },
  ];

  it('renders primary stats and all 9 master domain cards', () => {
    render(
      <>
        <QuestionBankStats
          categories={mockCategories}
          totalQuestionsCount={390}
          publishedCount={200}
          draftCount={190}
          categoryCount={6}
        />
        <QuestionBankIndex categories={mockCategories} />
      </>,
    );

    expect(screen.getByText('إجمالي الأسئلة')).toBeDefined();
    expect(screen.getByText('390')).toBeDefined();
    expect(screen.getByText('منشور')).toBeDefined();
    expect(screen.getByText('200')).toBeDefined();
    expect(screen.getByText('مسودة')).toBeDefined();
    expect(screen.getByText('190')).toBeDefined();
    expect(screen.getByText('تصنيفات')).toBeDefined();
    expect(screen.getByText('فهرس المجالات المعرفية')).toBeDefined();
    expect(screen.getAllByText('تصفح الأسئلة')).toHaveLength(9);
    expect(screen.getAllByText('ثقافة إسلامية ودين').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ثقافة عامة ومعلومات').length).toBeGreaterThan(0);
    expect(screen.getAllByText('جغرافيا وعوالم').length).toBeGreaterThan(0);
    expect(screen.getAllByText('تاريخ وحضارات').length).toBeGreaterThan(0);
    expect(screen.getAllByText('علوم وطبيعة').length).toBeGreaterThan(0);
    expect(screen.getAllByText('لغة وأدب وشعر').length).toBeGreaterThan(0);
    expect(screen.getAllByText('رياضة وبطولات').length).toBeGreaterThan(0);
    expect(screen.getAllByText('رياضيات وتفكير منطقي').length).toBeGreaterThan(0);
    expect(screen.getAllByText('تقنية وبرمجة').length).toBeGreaterThan(0);
    expect(screen.getAllByText('لا أسئلة بعد').length).toBeGreaterThan(0);
  });

  it('highlights the active domain card when activeDomain is set', () => {
    const { container } = render(
      <QuestionBankIndex categories={mockCategories} activeDomain="islamic" />,
    );

    expect(container.querySelector('[href="/questions?domain=islamic"]')).toBeDefined();
    expect(container.querySelector('[data-domain="islamic"][data-selected="true"]')).toBeTruthy();
    expect(container.querySelector('[href="/questions?domain=islamic"]')?.getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('keeps the compact list view when browsing a domain', () => {
    render(<QuestionBankIndex categories={mockCategories} activeDomain="history" activeView="list" />);

    expect(screen.getByRole('link', { name: /تاريخ وحضارات/ })).toHaveAttribute(
      'href',
      '/questions?domain=history&view=list',
    );
  });
});
