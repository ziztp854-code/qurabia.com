import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import type {
  EliminationGameEndedPayload,
  EliminationRoomSnapshot,
} from '@tahaddi/contracts';
import { EliminationRoom } from './elimination-room';
import type { EliminationSocketState } from './use-elimination-socket';

const socketState = (overrides: Partial<EliminationSocketState> = {}) => {
  const state: EliminationSocketState = {
    connected: true,
    connectionFailed: false,
    socketId: 'sock-1',
    room: null,
    error: '',
    errorCode: '',
    busy: false,
    gameEnd: null,
    countdown: null,
    setError: vi.fn(),
    setBusy: vi.fn(),
    socketRef: { current: null } as React.RefObject<EliminationSocketState['socketRef']['current']>,
    clearRoom: vi.fn(),
    guestIdentityInvalid: false,
    answerRejectedTick: 0,
    ...overrides,
  };
  return state;
};

const socketMock = vi.hoisted(() => ({
  useEliminationSocket: vi.fn(),
}));

vi.mock('./use-elimination-socket', () => socketMock);

function baseRoom(): EliminationRoomSnapshot {
  return {
    roomCode: 'ABC234',
    phase: 'active' as const,
    isHost: false,
    viewerPlayerId: 'p1',
    currentRound: 2,
    totalRounds: 5,
    roundTimeLimit: 20,
    aliveCount: 12,
    players: [
      { id: 'p1', name: 'سالم', alive: true, eliminatedAtRound: null, hasAnswered: false, isViewer: true },
      { id: 'p2', name: 'ريم', alive: true, eliminatedAtRound: null, hasAnswered: true, isViewer: false },
      { id: 'p3', name: 'ليلى', alive: false, eliminatedAtRound: 1, hasAnswered: true, isViewer: false },
    ],
    currentQuestion: {
      id: 'q2',
      prompt: 'كم عدد سور القرآن الكريم؟',
      options: ['100 سورة', '114 سورة', '120 سورة', '99 سورة'],
      difficulty: 'MEDIUM' as const,
      roundNumber: 2,
      timeLimit: 20,
    },
    myAnswer: null,
    revealedCorrectIndex: null,
    remainingSeconds: 14,
    lastRoundResult: null,
    startedAt: 1,
  } satisfies EliminationRoomSnapshot;
}

function renderRoom() {
  return render(<EliminationRoom />);
}

describe('EliminationRoom — طور اللعب', () => {
  it('يعرض السؤال أكبر عنصر مع المؤقت وسلّم الصعوبة', () => {
    socketMock.useEliminationSocket.mockReturnValue(
      socketState({ room: baseRoom() }),
    );
    renderRoom();

    expect(screen.getByText('كم عدد سور القرآن الكريم؟')).toBeInTheDocument();
    expect(screen.getByText('الجولة 2 من 5')).toBeInTheDocument();
    expect(screen.getByText('الصعوبة: متوسط')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'خيارات الإجابة' })).toBeInTheDocument();
    const ladder = screen.getByRole('list', { name: 'مراحل الحلقة' });
    expect(within(ladder).getByText('متوسط')).toBeInTheDocument();
    expect(within(ladder).getByText('النهائي')).toBeInTheDocument();
  });

  it('يعرض حالات اللاعبين: نشط، أجاب، مُقصى — ويبرز المشاهد', () => {
    socketMock.useEliminationSocket.mockReturnValue(
      socketState({ room: baseRoom() }),
    );
    renderRoom();

    const panel = screen.getByRole('complementary', { name: 'لوحة اللاعبين' });
    expect(within(panel).getByText('نشط')).toBeInTheDocument();
    expect(within(panel).getByText('أجاب')).toBeInTheDocument();
    expect(within(panel).getByText('مُقصى')).toBeInTheDocument();
    const viewerItem = within(panel).getByText('سالم').closest('li');
    expect(viewerItem).toHaveAttribute('data-viewer');
  });

  it('يمنع الإجابة الثانية بعد اختيار خيار', () => {
    const room = { ...baseRoom(), myAnswer: 1 };
    socketMock.useEliminationSocket.mockReturnValue(socketState({ room }));
    renderRoom();

    expect(screen.getByText(/قُيّدت إجابتك/)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /سورة/ })) {
      expect(button).toBeDisabled();
    }
  });

  it('يبقي إجابة خيار المشاهد علامة صح بعد الكشف', () => {
    const room = {
      ...baseRoom(),
      myAnswer: 1,
      revealedCorrectIndex: 1,
      remainingSeconds: null,
    };
    socketMock.useEliminationSocket.mockReturnValue(socketState({ room }));
    renderRoom();

    const correct = screen.getByRole('button', { name: /114 سورة/ });
    expect(correct.className).toContain('is-correct');
  });
});

describe('EliminationRoom — حسم الجولة', () => {
  const verdictRoom = (viewerOverrides: { hasAnswered: boolean; alive: boolean }) => ({
    ...baseRoom(),
    phase: 'between' as const,
    currentQuestion: null,
    revealedCorrectIndex: 1,
    remainingSeconds: null,
    aliveCount: 9,
    players: [
      { id: 'p1', name: 'سالم', alive: viewerOverrides.alive, eliminatedAtRound: viewerOverrides.alive ? null : 2, hasAnswered: viewerOverrides.hasAnswered, isViewer: true },
      { id: 'p2', name: 'ريم', alive: true, eliminatedAtRound: null, hasAnswered: true, isViewer: false },
    ],
    lastRoundResult: {
      roundNumber: 2,
      questionId: 'q2',
      prompt: 'كم عدد سور القرآن الكريم؟',
      options: ['100 سورة', '114 سورة', '120 سورة', '99 سورة'],
      correctIndex: 1,
      difficulty: 'MEDIUM' as const,
      survivorIds: ['p2'],
      eliminatedIds: viewerOverrides.alive ? [] : ['p1'],
      everyoneCorrect: false,
    },
  });

  it('يعلن إقصاء اللاعب الخاطئ بلافتة حمراء', () => {
    socketMock.useEliminationSocket.mockReturnValue(
      socketState({ room: verdictRoom({ hasAnswered: true, alive: false }) }),
    );
    renderRoom();

    expect(screen.getByText('تم إقصاؤك')).toBeInTheDocument();
    expect(screen.getByText('الإجابة الصحيحة:')).toBeInTheDocument();
    expect(screen.getByText('114 سورة', { selector: 'strong' })).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('تم إقصاؤك');
  });

  it('يذكر انتهاء الوقت لمن لم يجب', () => {
    socketMock.useEliminationSocket.mockReturnValue(
      socketState({ room: verdictRoom({ hasAnswered: false, alive: false }) }),
    );
    renderRoom();

    expect(screen.getByText('انتهى الوقت — تم إقصاؤك')).toBeInTheDocument();
  });

  it('يعرض إحصاءات الناجين والمقصيين والصعوبة القادمة', () => {
    socketMock.useEliminationSocket.mockReturnValue(
      socketState({ room: verdictRoom({ hasAnswered: true, alive: true }) }),
    );
    renderRoom();

    expect(screen.getByText('ناجٍ')).toBeInTheDocument();
    expect(screen.getByText('الصعوبة القادمة')).toBeInTheDocument();
    expect(screen.getByText('يتقدمون')).toBeInTheDocument();
  });
});

describe('EliminationRoom — التتويج', () => {
  it('يتوّج الناجي الأخير سينمائيًا مع أزرار الإعادة', () => {
    const gameEnd: EliminationGameEndedPayload = {
      championId: 'p1',
      championName: 'سالم',
      runnerUpId: 'p2',
      runnerUpName: 'ريم',
      totalRounds: 5,
      durationMs: 184_000,
    };
    const room: EliminationRoomSnapshot = {
      ...baseRoom(),
      phase: 'finished',
      currentQuestion: null,
      remainingSeconds: null,
      endedAt: 2,
      players: [
        { id: 'p1', name: 'سالم', alive: true, eliminatedAtRound: null, hasAnswered: true, isViewer: true },
        { id: 'p2', name: 'ريم', alive: false, eliminatedAtRound: 5, hasAnswered: true, isViewer: false },
      ],
    };
    socketMock.useEliminationSocket.mockReturnValue(
      socketState({ room, gameEnd }),
    );
    renderRoom();

    expect(screen.getByText('الناجي الأخير')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'سالم' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إعادة اللعب/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /العودة إلى الألعاب/ })).toBeInTheDocument();
    expect(screen.getByText('جولات نجا منها')).toBeInTheDocument();
  });

  it('يلطف الخسارة للمقصي في شاشة التتويج', () => {
    const gameEnd: EliminationGameEndedPayload = {
      championId: 'p2',
      championName: 'ريم',
      runnerUpId: 'p1',
      runnerUpName: 'سالم',
      totalRounds: 5,
      durationMs: 184_000,
    };
    const room: EliminationRoomSnapshot = {
      ...baseRoom(),
      phase: 'finished',
      currentQuestion: null,
      remainingSeconds: null,
      players: [
        { id: 'p1', name: 'سالم', alive: false, eliminatedAtRound: 3, hasAnswered: true, isViewer: true },
        { id: 'p2', name: 'ريم', alive: true, eliminatedAtRound: null, hasAnswered: true, isViewer: false },
      ],
    };
    socketMock.useEliminationSocket.mockReturnValue(
      socketState({ room, gameEnd }),
    );
    renderRoom();

    expect(screen.getByText(/أُقصيت في الجولة 3/)).toBeInTheDocument();
  });
});
