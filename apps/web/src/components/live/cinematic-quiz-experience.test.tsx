import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDisplayClock, setDisplayClockOffset } from './display-clock';
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

  it('preserves question media and labels the answer only after reveal', () => {
    const data: CinematicQuizData = {
      ...defaultLikeData,
      question: {
        questionId: 'media-question',
        prompt: 'ما المعلم الظاهر في الصورة؟',
        options: [{ id: 'answer', text: 'قصر المصمك', position: 0 }],
        media: [{ type: 'image', url: '/landmark.webp', alt: 'معلم تاريخي' }],
        questionStartedAt: 0,
        questionEndsAt: 15_000,
        questionNumber: 2,
        totalQuestions: 3,
      },
      reveal: {
        questionId: 'media-question',
        correctOptionId: 'answer',
        explanation: 'قصر المصمك معلم تاريخي في الرياض.',
        stats: { questionId: 'media-question', answeredCount: 0, participantCount: 5, options: [] },
      },
    };
    const { rerender } = render(<CinematicQuizExperience screen="question" data={data} />);
    expect(screen.getByRole('img', { name: 'معلم تاريخي' })).toHaveAttribute(
      'src',
      '/landmark.webp',
    );
    expect(screen.getByRole('timer', { name: 'متبقي 15 ثانية' })).toBeVisible();
    expect(screen.queryByText(data.reveal!.explanation!)).toBeNull();
    const options = screen.getByRole('group', { name: 'خيارات الإجابة' });
    expect(within(options).queryByText('صحيحة')).toBeNull();

    rerender(<CinematicQuizExperience screen="reveal" data={data} />);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(
      within(screen.getByRole('group', { name: 'خيارات الإجابة' })).getByText('صحيحة'),
    ).toBeVisible();
    expect(screen.getByText(data.reveal!.explanation!)).toBeVisible();
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

describe('cinematic live timing and transitions', () => {
  const liveData = (): CinematicQuizData => ({
    ...defaultLikeData,
    serverTime: 1_000_000,
    clockOffset: 1_000,
    question: {
      questionId: 'timed-question',
      prompt: 'سؤال متزامن؟',
      options: [{ id: 'a', text: 'إجابة', position: 0 }],
      media: [],
      questionStartedAt: 990_000,
      questionEndsAt: 1_020_000,
      questionNumber: 1,
      totalQuestions: 3,
    },
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    resetDisplayClock();
  });
  afterEach(() => {
    resetDisplayClock();
    vi.useRealTimers();
  });

  it('keeps socket timing independent from a previously opened broadcast', () => {
    setDisplayClockOffset(9_000);
    render(<CinematicQuizExperience screen="question" data={liveData()} />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole('timer', { name: 'متبقي 19 ثانية' })).toBeVisible();
  });

  it('uses the HTTP clock for a broadcast display', () => {
    setDisplayClockOffset(9_000);
    render(
      <CinematicQuizExperience screen="question" data={{ ...liveData(), clockSource: 'http' }} />,
    );
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole('timer', { name: 'متبقي 11 ثانية' })).toBeVisible();
  });

  it('renders the remaining snapshot time instead of restarting a late question', () => {
    render(
      <CinematicQuizExperience screen="question" data={{ ...liveData(), serverTime: 1_019_000 }} />,
    );
    expect(screen.getByRole('timer', { name: 'متبقي 1 ثانية' })).toBeVisible();
  });

  it('catches up immediately after a background tab resumes and cleans up timers', () => {
    const view = render(<CinematicQuizExperience screen="question" data={liveData()} />);
    act(() => {
      vi.setSystemTime(1_021_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('timer', { name: 'متبقي 0 ثانية' })).toBeVisible();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts a transition for a new question, but preserves the scene for stats updates', () => {
    const data = liveData();
    const { rerender } = render(<CinematicQuizExperience screen="question" data={data} />);
    const scene = screen.getByRole('heading', { level: 1 }).closest('[data-motion-scene]');
    rerender(<CinematicQuizExperience screen="question" data={{ ...data, participantCount: 7 }} />);
    expect(screen.getByRole('heading', { level: 1 }).closest('[data-motion-scene]')).toBe(scene);
    rerender(
      <CinematicQuizExperience
        screen="question"
        data={{
          ...data,
          question: { ...data.question!, questionId: 'next', questionStartedAt: 1_000_000 },
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).closest('[data-motion-scene]')).not.toBe(
      scene,
    );
  });
});
