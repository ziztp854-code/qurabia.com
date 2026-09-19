import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QUESTION_WORD_BANK, QUESTION_WORD_STORAGE_KEY } from '@/components/instant-games';
import { QuestionWordHost } from './question-word-host';

describe('QuestionWordHost', () => {
  afterEach(() => localStorage.clear());

  it('controls the host display and opens the final coronation', () => {
    localStorage.setItem(
      QUESTION_WORD_STORAGE_KEY,
      JSON.stringify({
        players: ['أحمد', 'سارة', 'نورة'],
        playerScores: { أحمد: 1000, سارة: 850, نورة: 700 },
        activePlayer: 'أحمد',
        answeredPlayers: ['أحمد'],
        roundIndex: 0,
        seconds: 60,
      }),
    );
    render(<QuestionWordHost />);

    expect(screen.getByRole('heading', { level: 1, name: 'كلمة وسؤال' })).toBeInTheDocument();
    expect(screen.getByText('739421')).toBeInTheDocument();
    expect(screen.getByText(QUESTION_WORD_BANK[0].question)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'فتح شاشة اللاعبين' })).toHaveAttribute(
      'href',
      '/games/question-word',
    );

    fireEvent.click(screen.getByRole('button', { name: 'إظهار الإجابة' }));
    expect(screen.getByText(QUESTION_WORD_BANK[0].answer)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'السؤال التالي' }));
    expect(screen.getByText(QUESTION_WORD_BANK[1].question)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إنهاء وتتويج' }));
    expect(screen.getByRole('heading', { level: 1, name: 'أحمد' })).toBeVisible();
    const podium = screen.getByRole('list', { name: 'منصة أبطال كلمة وسؤال' });
    expect(within(podium).getAllByRole('listitem')).toHaveLength(3);
    expect(within(podium).getByText('المركز الأول')).toBeVisible();
  });

  it('accepts older room data without a score table', () => {
    localStorage.setItem(QUESTION_WORD_STORAGE_KEY, JSON.stringify({ players: ['أحمد'] }));

    render(<QuestionWordHost />);

    expect(screen.getByText('أحمد')).toBeVisible();
    expect(screen.getAllByText('0')).not.toHaveLength(0);
  });
});
