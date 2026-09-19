import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CinematicQuizExperience, type CinematicQuizData } from './cinematic-quiz-experience';

describe('CinematicQuizExperience', () => {
  it.each([
    ['host', 'لوحة المضيف'],
    ['lobby', 'بانتظار اللاعبين'],
    ['question', 'السؤال المباشر'],
    ['reveal', 'كشف الإجابة'],
    ['leaderboard', 'الترتيب'],
    ['finale', 'التتويج'],
  ] as const)('renders the approved %s composition', (view, label) => {
    render(<CinematicQuizExperience screen={view} />);

    expect(screen.getByRole('region', { name: label })).toHaveAttribute('data-screen', view);
  });

  it('keeps the room code, real QR, and player count together in the lobby', () => {
    render(<CinematicQuizExperience screen="lobby" />);
    const lobby = screen.getByRole('region', { name: 'بانتظار اللاعبين' });

    expect(within(lobby).getByText('7X9K2')).toBeVisible();
    expect(within(lobby).getByRole('img', { name: /رمز QR/ })).toBeVisible();
    expect(within(lobby).getByText('28')).toBeVisible();
  });

  it('exposes every host control as a real button', () => {
    render(<CinematicQuizExperience screen="host" />);

    for (const label of [
      'بدء الجولة',
      'السؤال التالي',
      'كشف الإجابة',
      'إنهاء الجولة',
      'الصوت',
      'الإحصاءات',
      'قائمة الأسئلة',
      'إدارة اللاعبين',
      'الإعدادات',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeVisible();
    }
  });

  it('routes preview actions without depending on the previous live UI', () => {
    const onNavigate = vi.fn();
    render(<CinematicQuizExperience screen="host" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'بدء الجولة' }));
    fireEvent.click(screen.getByRole('button', { name: 'كشف الإجابة' }));
    fireEvent.click(screen.getByRole('button', { name: 'إنهاء الجولة' }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'question');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'reveal');
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'finale');
  });

  it('renders the reveal statistics and the five-place leaderboard', () => {
    const { rerender } = render(<CinematicQuizExperience screen="reveal" />);
    expect(screen.getByRole('progressbar', { name: 'تقدم الإجابات' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );

    rerender(<CinematicQuizExperience screen="leaderboard" />);
    expect(
      within(screen.getByRole('region', { name: 'الترتيب' })).getAllByRole('listitem'),
    ).toHaveLength(5);
  });

  it('builds the winner podium without personal portrait images', () => {
    render(<CinematicQuizExperience screen="finale" />);
    const finale = screen.getByRole('region', { name: 'التتويج' });

    expect(within(finale).getAllByRole('listitem')).toHaveLength(3);
    expect(within(finale).queryByRole('img', { name: /لاعب|فائز/ })).toBeNull();
  });

  it('renders live room, question, reveal, and ranking data instead of preview fixtures', () => {
    const data: CinematicQuizData = {
      roomCode: 'LIVE42',
      joinUrl: 'https://qurabia.com/join/LIVE42',
      participantCount: 9,
      totalQuestions: 6,
      phase: 'REVEAL',
      clockOffset: 0,
      connected: true,
      busy: false,
      question: {
        questionId: 'q-live',
        prompt: 'ما الكوكب الأحمر؟',
        options: [
          { id: 'mars', text: 'المريخ', position: 0 },
          { id: 'earth', text: 'الأرض', position: 1 },
        ],
        media: [],
        questionStartedAt: 1,
        questionEndsAt: Date.now() + 15_000,
        questionNumber: 2,
        totalQuestions: 6,
      },
      reveal: {
        questionId: 'q-live',
        correctOptionId: 'mars',
        explanation: null,
        stats: {
          questionId: 'q-live',
          answeredCount: 9,
          participantCount: 9,
          options: [
            { optionId: 'mars', count: 7, percentage: 78 },
            { optionId: 'earth', count: 2, percentage: 22 },
          ],
        },
      },
      stats: null,
      players: [
        { id: 'p1', name: 'فارس', rank: 1, score: 4000, streak: 3 },
        { id: 'p2', name: 'سارة', rank: 2, score: 3200, streak: 2 },
      ],
    };

    const { rerender } = render(<CinematicQuizExperience screen="lobby" data={data} />);
    expect(screen.getByText('LIVE42')).toBeVisible();
    expect(screen.getByText('9')).toBeVisible();

    rerender(<CinematicQuizExperience screen="reveal" data={data} />);
    expect(screen.getByText('ما الكوكب الأحمر؟')).toBeVisible();
    expect(screen.getAllByText('المريخ').length).toBeGreaterThan(0);

    rerender(<CinematicQuizExperience screen="leaderboard" data={data} />);
    expect(screen.getByText('فارس')).toBeVisible();
    expect(screen.getByText('4000')).toBeVisible();
  });

  it('sends host commands to the real controller boundary', () => {
    const onCommand = vi.fn();
    render(<CinematicQuizExperience screen="host" onCommand={onCommand} />);

    fireEvent.click(screen.getByRole('button', { name: 'بدء الجولة' }));
    fireEvent.click(screen.getByRole('button', { name: 'كشف الإجابة' }));

    expect(onCommand).toHaveBeenNthCalledWith(1, 'start');
    expect(onCommand).toHaveBeenNthCalledWith(2, 'reveal');
  });

  it('never shows preview fixtures while real live data is missing', () => {
    const emptyData: CinematicQuizData = {
      ...defaultLikeData,
      question: null,
      reveal: null,
      stats: null,
    };

    render(<CinematicQuizExperience screen="question" data={emptyData} />);
    expect(screen.getByText('بانتظار السؤال المباشر…')).toBeVisible();
    expect(screen.queryByText('ما عاصمة المملكة العربية السعودية؟')).toBeNull();
  });

  it('does not reveal a fabricated correct answer before the server reveals it', () => {
    const pendingRevealData: CinematicQuizData = {
      ...defaultLikeData,
      reveal: null,
      stats: null,
    };

    render(<CinematicQuizExperience screen="reveal" data={pendingRevealData} />);

    expect(screen.getByText('بانتظار كشف الإجابة…')).toBeVisible();
    expect(screen.queryByText('الإجابة الصحيحة')).toBeNull();
    expect(screen.queryByText('ما الكوكب الأحمر؟')).toBeNull();
  });

  it('hides the host navigation button on broadcast screens without a navigator', () => {
    const broadcastData: CinematicQuizData = {
      ...defaultLikeData,
      question: {
        questionId: 'q-live',
        prompt: 'سؤال مباشر؟',
        options: [{ id: 'opt-1', text: 'خيار', position: 0 }],
        media: [],
        questionStartedAt: 1,
        questionEndsAt: Date.now() + 15_000,
        questionNumber: 1,
        totalQuestions: 3,
      },
    };

    render(<CinematicQuizExperience screen="question" data={broadcastData} />);

    expect(screen.queryByRole('button', { name: 'العودة للوحة' })).toBeNull();
  });
});

const defaultLikeData: CinematicQuizData = {
  roomCode: 'LIVE77',
  joinUrl: 'https://qurabia.com/join/LIVE77',
  participantCount: 5,
  totalQuestions: 3,
  phase: 'QUESTION',
  question: null,
  reveal: null,
  stats: null,
  clockOffset: 0,
  connected: true,
  busy: false,
  players: [],
};
