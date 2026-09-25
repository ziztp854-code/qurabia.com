import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveHostExperience } from './live-host-experience';

const nextQuestion = vi.fn();
const revealQuestion = vi.fn();
const mockGame = vi.hoisted(() => ({
  connected: true,
  busy: false,
  message: '',
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
    snapshot: mockGame.hasSnapshot
      ? {
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
        }
      : null,
    stats: mockGame.stats,
    clockOffset: 0,
    connected: mockGame.connected,
    message: mockGame.message,
    busy: mockGame.busy,
    startQuestion: vi.fn(),
    nextQuestion,
    revealQuestion,
    skipQuestion: vi.fn(),
    finishGame: vi.fn(),
    submitAnswer: vi.fn(),
  }),
}));

describe('LiveHostExperience auto advance', () => {
  beforeEach(() => {
    nextQuestion.mockClear();
    revealQuestion.mockClear();
    mockGame.connected = true;
    mockGame.busy = false;
    mockGame.message = '';
    mockGame.participantCount = 4;
    mockGame.hasSnapshot = true;
    mockGame.phase = 'REVEAL';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the minimum players before enabling start', () => {
    mockGame.phase = 'LOBBY';
    mockGame.participantCount = 1;
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
        minimumPlayers={2}
        totalQuestions={2}
      />,
    );
    const startButton = screen.getByRole('button', { name: 'بدء السؤال الأول' });
    expect(startButton).toBeDisabled();
    expect(startButton).toHaveAccessibleDescription('ينقص متسابق واحد لبدء الجولة');
  });

  it('explains why a room without questions cannot start', () => {
    mockGame.phase = 'LOBBY';
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
        minimumPlayers={1}
        totalQuestions={0}
      />,
    );

    const startButton = screen.getByRole('button', { name: 'بدء السؤال الأول' });
    expect(startButton).toBeDisabled();
    expect(startButton).toHaveAccessibleDescription('لا يمكن البدء قبل إضافة سؤال واحد على الأقل');
    expect(screen.getByText('لا يمكن البدء قبل إضافة سؤال واحد على الأقل')).toBeVisible();
  });

  it('disables commands offline and resumes automatic advance after reconnecting', () => {
    mockGame.connected = false;
    const props = {
      sessionId: 'session-1',
      hostId: 'host-1',
      accessToken: 'token',
      roomCode: 'ABC123',
      joinUrl: 'https://example.test/join/ABC123',
      initialAutoAdvance: true,
    };
    const { rerender } = render(<LiveHostExperience {...props} />);
    expect(screen.getByRole('button', { name: 'السؤال التالي' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'تخطي السؤال' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'إنهاء الجولة' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(2_000));
    expect(nextQuestion).not.toHaveBeenCalled();
    mockGame.connected = true;
    rerender(<LiveHostExperience {...props} />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(nextQuestion).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight command before automatically advancing', () => {
    mockGame.busy = true;
    const props = {
      sessionId: 'session-1',
      hostId: 'host-1',
      accessToken: 'token',
      roomCode: 'ABC123',
      joinUrl: 'https://example.test/join/ABC123',
      initialAutoAdvance: true,
    };
    const { rerender } = render(<LiveHostExperience {...props} />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(nextQuestion).not.toHaveBeenCalled();
    mockGame.busy = false;
    rerender(<LiveHostExperience {...props} />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(nextQuestion).toHaveBeenCalledTimes(1);
  });

  it('allows the host to close answers using the existing reveal command', () => {
    mockGame.phase = 'QUESTION';
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
    fireEvent.click(screen.getByRole('button', { name: 'إظهار الإجابة' }));
    expect(revealQuestion).toHaveBeenCalledWith('question-1');
    expect(screen.queryByRole('button', { name: 'إضافة وقت' })).not.toBeInTheDocument();
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

    expect(screen.getByRole('img', { name: 'رمز QR للانضمام إلى الغرفة ABC123' })).toBeVisible();
    expect(screen.getByText('https://example.test/join/ABC123')).toBeVisible();
    expect(screen.getByRole('region', { name: 'المتسابقون في الجولة' })).toBeVisible();
    expect(screen.getByText('الغرفة متصلة')).toBeVisible();
  });

  it('keeps every contestant visible when fewer players are currently connected', () => {
    mockGame.phase = 'LOBBY';
    mockGame.participantCount = 1;
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
        minimumPlayers={2}
        totalQuestions={2}
      />,
    );

    const roster = screen.getByRole('region', { name: 'المتسابقون في الجولة' });
    expect(within(roster).getByText('سارة')).toBeVisible();
    expect(within(roster).getByText('محمد')).toBeVisible();
    expect(within(roster).getByText('نورة')).toBeVisible();
    expect(screen.getByRole('button', { name: 'بدء السؤال الأول' })).toBeDisabled();
  });

  it('presents the royal host lobby as the reference control dashboard', () => {
    mockGame.phase = 'LOBBY';
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
        minimumPlayers={1}
        maxPlayers={12}
        quizTitle="مسابقة الثقافة العامة"
        totalQuestions={2}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'التنقل في لوحة المضيف' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'مسابقة الثقافة العامة' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'جاهزية الجولة' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'المتسابقون في الجولة' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'ملخص الغرفة' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'تنبيهات النظام' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'بدء السؤال الأول' })).toBeEnabled();
  });

  it('shows command feedback inside the redesigned lobby', () => {
    mockGame.phase = 'LOBBY';
    mockGame.message = 'تعذر بدء الجولة، حاول مرة أخرى';
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
        minimumPlayers={1}
        totalQuestions={2}
      />,
    );

    expect(screen.getByText('تعذر بدء الجولة، حاول مرة أخرى')).toHaveAttribute('role', 'status');
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
    expect(screen.getByLabelText('لوبي الجولة')).toContainElement(
      screen.getByLabelText('دعوة اللاعبين'),
    );
    expect(screen.getByRole('heading', { name: 'جاهزية الجولة' })).toBeVisible();

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
    expect(screen.queryByRole('heading', { name: 'جاهزية الجولة' })).not.toBeInTheDocument();
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
