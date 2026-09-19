import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionCatalog } from './question-catalog';
import type { CatalogQuestion } from './question-catalog-item';
import { getMasterDomainForCategory } from '@/lib/questions/bank-index';

const question: CatalogQuestion = {
  id: 'q1',
  prompt: 'ما عاصمة نجد التاريخية؟',
  timeLimit: 20,
  type: 'MULTIPLE_CHOICE',
  difficulty: 'MEDIUM',
  status: 'PUBLISHED',
  basePoints: 1000,
  options: [{ id: 'a' }, { id: 'b' }],
  category: { id: 'c1', name: 'تاريخ' },
};

describe('QuestionCatalog', () => {
  it('exposes stage and list view links and renders grouped questions', () => {
    render(
      <QuestionCatalog
        groups={[
          {
            canonicalName: 'تاريخ',
            domain: getMasterDomainForCategory('تاريخ'),
            questions: [question],
          },
        ]}
        view="stage"
        matchingCount={12}
        randomSeed=""
        randomHref="/questions?random=seed"
        page={1}
        pageCount={1}
        listQuery={{ domain: 'history' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'أسئلة المنصة' })).toBeDefined();
    expect(screen.getByText('تاريخ')).toBeDefined();
    expect(screen.getByRole('link', { name: 'عرض منصة' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'عرض قائمة' })).toHaveAttribute(
      'href',
      '/questions?domain=history&view=list',
    );
    expect(screen.getByText('ما عاصمة نجد التاريخية؟')).toBeDefined();
  });

  it('invites adding a question when the filtered catalog is empty', () => {
    render(
      <QuestionCatalog
        groups={[]}
        view="list"
        matchingCount={0}
        randomSeed=""
        randomHref="/questions?random=seed"
        page={1}
        pageCount={1}
        listQuery={{ view: 'list' }}
      />,
    );

    expect(screen.getByRole('heading', { name: /لا توجد أسئلة مطابقة/ })).toBeDefined();
    expect(screen.getByRole('link', { name: 'إضافة سؤال جديد' })).toHaveAttribute(
      'href',
      '#question-editor',
    );
  });
});
