import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveHostExperience } from './live-host-experience';

const nextQuestion = vi.fn();
const mockGame = vi.hoisted(() => ({
  hasSnapshot: true,
  phase: 'REVEAL',
  participantCount: 4,
  leaderboard: [
    { id: 'player-1', name: 'سارة', score: 2400, streak: 2, rank: 1 },
    { id: 'player-2', name: 'محمد', score: 2100, streak: 1, rank: 2 },
    { id: 'player-3', name: 'نورة', score: 1800, streak: 1, rank: 3 },
  ],
  stats: {
    questionId: 'question-1',
    answeredCount: 2,
    participantCount: 4,
    options: [
      { optionId: 'option-1', count: 1, percentage: 50 },
      { optionId: 'option-2', count: 1, percentage: 50 },
    ],
  },
}));

vi.mock('./use-live-game', () => ({
  useLiveGame: () => ({
    snapshot: mockGame.hasSnapshot ? {
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: mockGame.phase,
      serverTime: Date.now(),
      question: {
        questionId: 'question-1',
        prompt: 'ما الإجابة؟',
        options: [
          { id: 'option-1', text: 'الأولى', position: 0 },
          { id: 'option-2', text: 'الثانية', position: 1 },
        ],
        media: [],
        questionStartedAt: Date.now() - 5_000,
        questionEndsAt: Date.now(),
        questionNumber: 1,
        totalQuestions: 2,
      },
      reveal: null,
      leaderboard: mockGame.leaderboard,
      participantCount: mockGame.participantCount,
      playerAnswer: null,
      playerResult: null,
    } : null,
    stats: mockGame.stats,
    clockOffset: 0,
    connected: true,
    message: '',
    busy: false,
    startQuestion: vi.fn(),
    nextQuestion,
    finishGame: vi.fn(),
    submitAnswer: vi.fn(),
  }),
}));

describe('LiveHostExperience auto advance', () => {
  beforeEach(() => {
    nextQuestion.mockClear();
    mockGame.hasSnapshot = true;
    mockGame.phase = 'REVEAL';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets the host disable or enable the automatic next question request', () => {
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إعدادات العرض' }));
    const toggle = screen.getByRole('button', { name: /الانتقال التلقائي/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);
    act(() => vi.advanceTimersByTime(2_000));
    expect(nextQuestion).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    act(() => vi.advanceTimersByTime(2_000));
    expect(nextQuestion).toHaveBeenCalledTimes(1);
  });

  it('keeps the current question dominant and exposes compact host statistics and tools', () => {
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
        quizTitle="مسابقة الثقافة العامة"
        totalQuestions={2}
        questions={[
          {
            questionId: 'quiz-question-1',
            question: {
              id: 'question-1',
              prompt: 'ما الإجابة؟',
              imageUrl: null,
              category: 'ثقافة عامة',
              timeLimit: 20,
              basePoints: 1_000,
              options: [
                { id: 'option-1', text: 'الأولى', isCorrect: true },
                { id: 'option-2', text: 'الثانية', isCorrect: false },
              ],
            },
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'ما الإجابة؟' })).toBeVisible();
    expect(screen.getByLabelText('تحدّي — لوحة المضيف')).toBeVisible();
    expect(screen.getByText('ABC123')).toBeVisible();
    expect(
      screen.queryByRole('img', { name: 'رمز QR للانضمام إلى الغرفة ABC123' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قائمة الأسئلة' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'قائمة الأسئلة' })).toHaveAttribute(
      'aria-controls',
      'royal-host-question-navigator',
    );
    expect(screen.queryByLabelText('قائمة أسئلة الجولة')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'قائمة الأسئلة' }));
    expect(screen.getByLabelText('قائمة أسئلة الجولة')).toBeVisible();
    expect(screen.getByLabelText('قائمة أسئلة الجولة')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('قائمة أسئلة الجولة')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قائمة الأسئلة' })).toHaveFocus();

    expect(screen.getByRole('button', { name: 'إحصاءات البث' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByLabelText('إحصاءات البث المباشر')).toBeVisible();
    expect(screen.getAllByText('نسبة الإجابات').length).toBeGreaterThan(0);
    expect(screen.getByText('لم يجب')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'إحصاءات البث' }));
    expect(screen.queryByLabelText('إحصاءات البث المباشر')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إدارة المشاركين/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'إعدادات العرض' })).toHaveAttribute(
      'aria-controls',
      'royal-host-display-settings',
    );
    expect(screen.getByRole('button', { name: /إدارة المشاركين/ })).toHaveAttribute(
      'aria-controls',
      'royal-host-participant-drawer',
    );
    expect(screen.getByRole('link', { name: /عرض شاشة العرض/ })).toHaveAttribute(
      'href',
      '/display?sessionId=session-1',
    );
    expect(screen.getByRole('link', { name: /ملف المدير/ })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: /لوحة الشرف/ })).toHaveAttribute(
      'href',
      '/leaderboard',
    );
    expect(screen.getByRole('button', { name: /إنهاء الجولة/ })).toHaveClass(
      'royal-host-tool-danger',
    );
  });

  it('keeps the QR invitation visible while contestants are joining', () => {
    mockGame.phase = 'LOBBY';
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'رمز QR للانضمام إلى الغرفة ABC123' }),
    ).toBeVisible();
    expect(screen.getByText('https://example.test/join/ABC123')).toBeVisible();
    expect(screen.getAllByText('ضمن الجولة')).toHaveLength(3);
    expect(screen.queryByText('متصل')).not.toBeInTheDocument();
  });

  it('renders one central surface and only mounts the QR invitation in the lobby', () => {
    mockGame.hasSnapshot = false;
    const { rerender } = render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
      />,
    );

    expect(screen.getByLabelText('حالة اتصال المضيف')).toBeVisible();
    expect(screen.queryByLabelText('دعوة اللاعبين')).not.toBeInTheDocument();
    expect(screen.getByLabelText('السؤال الحالي').querySelector('.royal-host-lobby')).toBeNull();

    mockGame.hasSnapshot = true;
    mockGame.phase = 'LOBBY';
    rerender(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
      />,
    );
    expect(screen.getByLabelText('دعوة اللاعبين')).toBeVisible();
    expect(screen.getByLabelText('السؤال الحالي')).toContainElement(
      screen.getByLabelText('دعوة اللاعبين'),
    );
    expect(screen.getByLabelText('قائمة انتظار المتسابقين')).toBeVisible();

    mockGame.phase = 'QUESTION';
    rerender(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
      />,
    );
    expect(screen.queryByLabelText('دعوة اللاعبين')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('قائمة انتظار المتسابقين')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ما الإجابة؟' })).toBeVisible();
  });

  it('maps the live snapshot into the six host dashboard regions', () => {
    mockGame.phase = 'QUESTION';
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
        quizTitle="مسابقة الثقافة العامة"
        totalQuestions={2}
        questions={[
          {
            questionId: 'quiz-question-1',
            question: {
              id: 'question-1',
              prompt: 'ما الإجابة؟',
              imageUrl: null,
              category: 'ثقافة عامة',
              timeLimit: 20,
              basePoints: 1_000,
              options: [
                { id: 'option-1', text: 'الأولى', isCorrect: true },
                { id: 'option-2', text: 'الثانية', isCorrect: false },
              ],
            },
          },
        ]}
      />,
    );

    const dashboard = screen.getByLabelText('لوحة المضيف المباشرة');
    expect(dashboard).toBeVisible();
    expect(dashboard).toHaveClass('royal-host-dashboard', 'royal-live');
    expect(dashboard).not.toHaveClass('live-experience', 'live-host-experience');
    expect(dashboard.querySelector('[class^="host-"], [class*=" host-"]')).toBeNull();
    expect(
      dashboard.querySelector(
        '[class^="live-"], [class*=" live-"], [class^="cinematic-"], [class*=" cinematic-"]',
      ),
    ).toBeNull();
    expect(screen.getByText('مسابقة الثقافة العامة')).toBeVisible();
    expect(screen.getAllByText('السؤال 1 من 2')).not.toHaveLength(0);

    const ranking = screen.getByLabelText('ترتيب المتسابقين المباشر');
    expect(within(ranking).getByText('سارة')).toBeVisible();

    const answers = screen.getByLabelText('الإجابات المباشرة');
    expect(within(answers).getByText('الأولى')).toBeVisible();
    expect(within(answers).getAllByText('50٪')).toHaveLength(2);

    const podium = screen.getByLabelText('منصة أفضل ثلاثة متسابقين');
    expect(within(podium).getByText('محمد')).toBeVisible();
    expect(screen.getByLabelText('تنبيهات المضيف')).toBeVisible();
    expect(screen.getByLabelText('إحصائيات الجولة')).toBeVisible();
  });

  it('announces the winner from the live leaderboard when the round finishes', () => {
    mockGame.phase = 'FINISHED';
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
      />,
    );

    const podium = screen.getByLabelText('منصة أفضل ثلاثة متسابقين');
    expect(podium).toHaveAttribute('aria-live', 'polite');
    expect(within(podium).getByText('الفائز')).toBeVisible();
    expect(within(podium).getByText('سارة')).toBeVisible();
  });

  it('keeps the finish action available while players are still in the lobby', () => {
    mockGame.phase = 'LOBBY';
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
      />,
    );

    expect(screen.getByRole('button', { name: /إنهاء الجولة/ })).toBeVisible();
  });
});
