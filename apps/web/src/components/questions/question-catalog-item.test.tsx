import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionCatalogItem, type CatalogQuestion } from './question-catalog-item';

const question: CatalogQuestion = {
  id: 'q1',
  prompt: 'ما عاصمة نجد التاريخية؟',
  imageUrl: null,
  timeLimit: 20,
  type: 'MULTIPLE_CHOICE',
  difficulty: 'HARD',
  status: 'PUBLISHED',
  basePoints: 1000,
  options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  category: { id: 'c1', name: 'تاريخ' },
};

describe('QuestionCatalogItem', () => {
  it('requires answer options before offering to add a question', () => {
    render(<QuestionCatalogItem question={{ ...question, options: [] }} view="list" />);
    expect(
      screen.queryByRole('button', { name: 'إضافة السؤال إلى المسابقة' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('أضف خيارات إجابة قبل اختيار السؤال.')).toBeInTheDocument();
  });
  it('renders stage metadata with icons instead of emoji difficulty marks', () => {
    const { container } = render(<QuestionCatalogItem question={question} view="stage" />);

    expect(screen.getByText('ما عاصمة نجد التاريخية؟')).toBeDefined();
    expect(screen.getByText('اختيار متعدد')).toBeDefined();
    expect(screen.getByText('صعب')).toBeDefined();
    expect(screen.getByText('منشور')).toBeDefined();
    expect(screen.queryByText(/🟢|🟡|🔴/)).toBeNull();
    expect(container.querySelector('[data-view="stage"]')).toBeTruthy();
    expect(screen.getByRole('link', { name: /تعديل/ })).toHaveAttribute('href', '/questions/q1');
  });

  it('renders list view as an article row with difficulty and status text', () => {
    const { container } = render(<QuestionCatalogItem question={question} view="list" />);
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('article')).toHaveAttribute('data-view', 'list');
    expect(screen.getByText('صعب')).toBeDefined();
    expect(screen.getByText('منشور')).toBeDefined();
  });

  it('keeps the image in flow so list actions stay clickable', () => {
    const { container } = render(
      <QuestionCatalogItem
        question={{ ...question, imageUrl: 'https://cdn.example/q.png' }}
        view="list"
      />,
    );

    const image = container.querySelector('img');
    expect(image).toBeTruthy();
    expect(getComputedStyle(image!).position).not.toBe('absolute');
    expect(screen.getByRole('link', { name: /تعديل/ })).toBeDefined();
  });
});
