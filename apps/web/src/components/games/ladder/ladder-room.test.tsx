import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LadderRoom } from './ladder-room';

const ioMock = vi.hoisted(() => vi.fn());

const socketMock = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    id: 'socket-1',
    listeners,
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
    }),
    join: vi.fn(),
    leave: vi.fn(),
  };
});

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => {
    ioMock(...args);
    return socketMock;
  },
}));

vi.mock('./ladder-visual', () => ({
  LadderVisual: () => <div data-testid="mock-ladder-visual" />,
}));

vi.mock('./question-display', () => ({
  QuestionDisplay: () => <div data-testid="mock-question-display" />,
}));

vi.mock('./team-panel', () => ({
  TeamPanel: () => <div data-testid="mock-team-panel" />,
}));

const connectSocket = () => {
  act(() => {
    socketMock.listeners.get('connect')?.();
  });
};

const emitError = (code: string, message: string) => {
  act(() => {
    socketMock.listeners.get('ladder:error')?.({ code, message });
  });
};

const emitRoomState = (snapshot: unknown) => {
  act(() => {
    socketMock.listeners.get('ladder:room:state')?.(snapshot);
  });
};

describe('LadderRoom guest identity recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    socketMock.listeners.clear();
    socketMock.emit.mockClear();
    socketMock.disconnect.mockClear();
    ioMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('connects the socket with a freshly generated guest id and token', async () => {
    render(<LadderRoom />);

    await waitFor(() => {
      expect(ioMock).toHaveBeenCalledTimes(1);
    });

    const auth = (ioMock.mock.calls[0]?.[1] as { auth?: { guestId?: string; guestToken?: string } })
      ?.auth;
    expect(auth?.guestId).toMatch(/^[a-f0-9]{24}$/);
    expect(auth?.guestToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reuses the persisted guest id/token across remounts in the same tab', async () => {
    const firstRender = render(<LadderRoom />);
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1));
    const firstAuth = (ioMock.mock.calls[0]?.[1] as { auth?: { guestId?: string } })?.auth;
    firstRender.unmount();

    // Re-mount the room component; sessionStorage persists in jsdom.
    render(<LadderRoom />);
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(2));
    const secondAuth = (ioMock.mock.calls[1]?.[1] as { auth?: { guestId?: string } })?.auth;
    expect(secondAuth?.guestId).toBe(firstAuth?.guestId);
  });

  it('lets a player type a join code instead of relying on a missing setter', async () => {
    const user = userEvent.setup();
    render(<LadderRoom />);
    connectSocket();

    await user.type(screen.getByLabelText('اسم اللاعب'), 'عبدالعزيز');

    const joinButton = screen.getByRole('button', { name: /انضمام برمز/ });
    expect(joinButton).toBeDisabled();

    await user.type(screen.getByLabelText('رمز الغرفة'), 'ab12cd');
    expect(screen.getByLabelText('رمز الغرفة')).toHaveValue('AB12CD');
    expect(joinButton).toBeEnabled();
  });

  it.each(['left', 'right'] as const)('automatically joins the invited %s team once when connected', async (team) => {
    render(<LadderRoom initialRoomCode="ab12cd34" initialPlayerName=" لاعب اختبار " initialTeam={team} />);
    expect(screen.getByLabelText('اسم اللاعب')).toHaveValue('لاعب اختبار');
    expect(screen.getByRole('radio', { name: team === 'left' ? /المتسابق الأيسر/ : /المتسابق الأيمن/ })).toBeChecked();
    expect(socketMock.emit).not.toHaveBeenCalledWith('ladder:join', expect.anything());
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:join', {
      roomCode: 'AB12CD34', playerName: 'لاعب اختبار', team,
    }));
    emitError('ROOM_NOT_FOUND', 'الغرفة غير موجودة');
    expect(screen.getByText('الغرفة غير موجودة أو انتهت.')).toBeInTheDocument();
    connectSocket();
    expect(socketMock.emit.mock.calls.filter(([event]) => event === 'ladder:join')).toHaveLength(1);
  });

  it('restores an already joined invitation on reload without joining a second time', async () => {
    const first = render(<LadderRoom initialRoomCode="AB12CD34" initialPlayerName="لاعب اختبار" initialTeam="left" />);
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:join', expect.anything()));
    emitRoomState({ roomCode: 'AB12CD34', phase: 'waiting', rightTeam: [], leftTeam: [], isHost: false });
    first.unmount();
    socketMock.emit.mockClear();
    render(<LadderRoom initialRoomCode="AB12CD34" initialPlayerName="لاعب اختبار" initialTeam="left" />);
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:reconnect', { roomCode: 'AB12CD34' }));
    expect(socketMock.emit).not.toHaveBeenCalledWith('ladder:join', expect.anything());
  });

  it('does not automatically join for invalid invitation data, even when corrected manually', async () => {
    const user = userEvent.setup();
    render(<LadderRoom initialRoomCode="bad" initialPlayerName="x" initialTeam="left" />);
    connectSocket();
    expect(socketMock.emit).not.toHaveBeenCalledWith('ladder:join', expect.anything());
    await user.clear(screen.getByLabelText('اسم اللاعب'));
    await user.type(screen.getByLabelText('اسم اللاعب'), 'لاعب اختبار');
    await user.clear(screen.getByLabelText('رمز الغرفة'));
    await user.type(screen.getByLabelText('رمز الغرفة'), 'AB12CD34');
    expect(socketMock.emit).not.toHaveBeenCalledWith('ladder:join', expect.anything());
  });

  it('uses the edited name and team when the connection arrives', async () => {
    const user = userEvent.setup();
    render(<LadderRoom initialRoomCode="AB12CD34" initialPlayerName="الاسم الأول" initialTeam="right" />);
    await user.clear(screen.getByLabelText('اسم اللاعب'));
    await user.type(screen.getByLabelText('اسم اللاعب'), 'الاسم الجديد');
    await user.click(screen.getByRole('radio', { name: /المتسابق الأيسر/ }));
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:join', {
      roomCode: 'AB12CD34', playerName: 'الاسم الجديد', team: 'left',
    }));
  });

  it('reconnects rather than repeating join when the connection drops before acknowledgement', async () => {
    render(<LadderRoom initialRoomCode="AB12CD34" initialPlayerName="لاعب اختبار" initialTeam="left" />);
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:join', expect.anything()));
    act(() => socketMock.listeners.get('disconnect')?.());
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:reconnect', { roomCode: 'AB12CD34' }));
    expect(socketMock.emit.mock.calls.filter(([event]) => event === 'ladder:join')).toHaveLength(1);
  });

  it('offers a retry with the same guest identity if reconnect cannot find the unacknowledged join', async () => {
    const user = userEvent.setup();
    render(<LadderRoom initialRoomCode="AB12CD34" initialPlayerName="لاعب اختبار" initialTeam="left" />);
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:join', expect.anything()));
    const initialAuth = ioMock.mock.calls[0]?.[1];
    act(() => socketMock.listeners.get('disconnect')?.());
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:reconnect', { roomCode: 'AB12CD34' }));
    emitError('INVALID_GUEST', 'هوية الضيف غير صالحة');
    expect(socketMock.emit.mock.calls.filter(([event]) => event === 'ladder:join')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'إعادة محاولة الانضمام بالهوية الحالية' }));
    expect(socketMock.emit.mock.calls.filter(([event]) => event === 'ladder:join')).toHaveLength(2);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock.mock.calls[0]?.[1]).toEqual(initialAuth);
  });

  it('clears the saved membership when the server reports an invalid session', async () => {
    sessionStorage.setItem('tahaddi-ladder-joined-room', 'AB12CD34');
    render(<LadderRoom initialRoomCode="AB12CD34" initialPlayerName="لاعب اختبار" initialTeam="left" />);
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:reconnect', { roomCode: 'AB12CD34' }));
    emitError('INVALID_SESSION', 'انتهت الجلسة');
    expect(sessionStorage.getItem('tahaddi-ladder-joined-room')).toBeNull();
    expect(screen.getByText('انتهت الجلسة')).toBeInTheDocument();
  });

  it.each([true, false])('shows the invitation QR only for the host: %s', async (isHost) => {
    render(<LadderRoom />);
    connectSocket();
    emitRoomState({ roomCode: 'AB12CD34', phase: 'waiting', rightTeam: [], leftTeam: [], isHost });
    const qr = screen.queryByRole('img', { name: /رمز مسح للانضمام إلى غرفة السلم AB12CD34/ });
    if (isHost) expect(qr).toBeInTheDocument();
    else expect(qr).not.toBeInTheDocument();
  });

  it('disables player join while the guest identity is invalid', async () => {
    const user = userEvent.setup();
    render(<LadderRoom />);
    connectSocket();

    const nameInput = screen.getByLabelText('اسم اللاعب');
    await user.type(nameInput, 'عبدالعزيز');

    emitError('INVALID_GUEST', 'هوية الضيف غير صالحة أو منتهية.');

    const joinButton = screen.getByRole('button', { name: /انضمام برمز/ });
    expect(joinButton).toBeDisabled();

    const recoverButton = await screen.findByRole('button', { name: /تجديد الهوية الآن/ });
    expect(recoverButton).toBeInTheDocument();
  });

  it('uses the signed host identity only in the protected host view', async () => {
    render(
      <LadderRoom
        role="host"
        hostIdentity={{ hostId: 'user-host', accessToken: 'signed-host-token' }}
        hostName="عبدالعزيز"
      />,
    );

    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1));
    expect(ioMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: {
          hostId: 'user-host',
          hostAccessToken: 'signed-host-token',
        },
      }),
    );
    expect(screen.getByText('أنت المضيف: عبدالعزيز')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إنشاء الغرفة/ })).toBeDisabled();
    expect(screen.queryByLabelText('اسم اللاعب')).not.toBeInTheDocument();
    expect(screen.queryByText('اختر الفريق')).not.toBeInTheDocument();
  });

  it('creates a ten-question room using difficulty-based timing', async () => {
    const user = userEvent.setup();
    render(<LadderRoom role="host" hostIdentity={{ hostId: 'user-host', accessToken: 'signed-host-token' }} />);
    connectSocket();
    await user.click(screen.getByRole('button', { name: /إنشاء الغرفة/ }));
    expect(socketMock.emit).toHaveBeenCalledWith('ladder:host', {
      totalRounds: 10,
      winningPosition: 10,
    });
  });

  it('sends an explicit minimum time only when the host chooses one', async () => {
    const user = userEvent.setup();
    render(<LadderRoom role="host" hostIdentity={{ hostId: 'user-host', accessToken: 'signed-host-token' }} />);
    connectSocket();
    await user.selectOptions(screen.getByLabelText('وقت السؤال'), '45');
    await user.click(screen.getByRole('button', { name: /إنشاء الغرفة/ }));
    expect(socketMock.emit).toHaveBeenCalledWith('ladder:host', {
      totalRounds: 10,
      winningPosition: 10,
      questionTimeLimit: 45,
    });
  });

  it('regenerates identity and reconnects when the user clicks "تجديد الهوية"', async () => {
    const user = userEvent.setup();
    render(<LadderRoom />);
    connectSocket();

    const firstAuth = (
      ioMock.mock.calls[0]?.[1] as { auth?: { guestId?: string; guestToken?: string } }
    )?.auth;
    expect(firstAuth?.guestId).toBeDefined();

    const nameInput = screen.getByLabelText('اسم اللاعب');
    await user.type(nameInput, 'عبدالعزيز');

    emitError('INVALID_GUEST', 'هوية الضيف غير صالحة أو منتهية.');

    const recoverButton = await screen.findByRole('button', { name: /تجديد الهوية الآن/ });
    await user.click(recoverButton);

    // The socket should be torn down and a new one created with a new id/token.
    await waitFor(() => {
      expect(ioMock).toHaveBeenCalledTimes(2);
      expect(socketMock.disconnect).toHaveBeenCalled();
    });
    const newAuth = (
      ioMock.mock.calls[1]?.[1] as { auth?: { guestId?: string; guestToken?: string } }
    )?.auth;
    expect(newAuth?.guestId).toBeDefined();
    expect(newAuth?.guestId).not.toBe(firstAuth?.guestId);
    expect(newAuth?.guestToken).not.toBe(firstAuth?.guestToken);
  });

  it('clears the INVALID_GUEST banner when a fresh room state is received', async () => {
    const user = userEvent.setup();
    render(<LadderRoom />);
    connectSocket();

    await user.type(screen.getByLabelText('اسم اللاعب'), 'عبدالعزيز');
    emitError('INVALID_GUEST', 'هوية الضيف غير صالحة أو منتهية.');

    expect(
      screen.getByText('تعذر استعادة جلسة الضيف. يمكنك إعادة محاولة الانضمام بالهوية الحالية أو تجديدها.'),
    ).toBeInTheDocument();

    // Recover -> reconnect -> receive a room snapshot
    await user.click(screen.getByRole('button', { name: /تجديد الهوية الآن/ }));

    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(2));
    connectSocket();

    emitRoomState({
      roomCode: 'AB12CD34',
      phase: 'waiting',
      currentRound: 0,
      totalRounds: 10,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: 10,
      currentQuestion: null,
      rightTeam: [],
      leftTeam: [],
      isHost: true,
    });

    await waitFor(() => {
      expect(
        screen.queryByText('هوية الضيف السابقة انتهت. أنشئ هوية جديدة للمتابعة دون فقدان التقدم.'),
      ).not.toBeInTheDocument();
    });
  });

  it('does not announce a winner when the server stops the game', () => {
    render(<LadderRoom role="host" hostIdentity={{ hostId: 'user-host', accessToken: 'signed-host-token' }} />);
    connectSocket();
    emitRoomState({ roomCode: 'AB12CD', phase: 'finished', currentRound: 3, totalRounds: 10,
      rightScore: 1, leftScore: 0, rightPosition: 1, leftPosition: 0, winningPosition: 10,
      currentQuestion: null, rightTeam: [], leftTeam: [], isHost: true });
    act(() => socketMock.listeners.get('ladder:game:end')?.({
      winner: null, rightScore: 1, leftScore: 0, durationMs: 1000,
    }));
    expect(screen.getByText('توقفت الجولة')).toBeInTheDocument();
    expect(screen.queryByText('يفوز فريق اليسار')).not.toBeInTheDocument();
  });


  it('restores the same host room after a reload in the same tab', async () => {
    const first = render(<LadderRoom role="host" hostIdentity={{ hostId: 'host', accessToken: 'token' }} />);
    connectSocket();
    emitRoomState({ roomCode: 'AB12CD34', phase: 'waiting', rightTeam: [], leftTeam: [], isHost: true });
    first.unmount();
    socketMock.emit.mockClear();
    render(<LadderRoom role="host" hostIdentity={{ hostId: 'host', accessToken: 'new-token' }} />);
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:reconnect', { roomCode: 'AB12CD34' }));
  });

  it('restores a player room after reload even when the link has no name parameters', async () => {
    sessionStorage.setItem('tahaddi-ladder-joined-room', 'AB12CD34');
    render(<LadderRoom />);
    connectSocket();
    await waitFor(() => expect(socketMock.emit).toHaveBeenCalledWith('ladder:reconnect', { roomCode: 'AB12CD34' }));
  });

  it('does not restore a previous player room when opening a different invitation', () => {
    sessionStorage.setItem('tahaddi-ladder-joined-room', 'AB12CD34');
    render(<LadderRoom initialRoomCode="EF56GH78" />);
    connectSocket();
    expect(socketMock.emit).not.toHaveBeenCalledWith('ladder:reconnect', expect.anything());
  });

  it('clears the saved host room on explicit exit', async () => {
    const user = userEvent.setup();
    render(<LadderRoom role="host" hostIdentity={{ hostId: 'host', accessToken: 'token' }} />);
    connectSocket();
    emitRoomState({ roomCode: 'AB12CD34', phase: 'waiting', rightTeam: [], leftTeam: [], isHost: true });
    expect(sessionStorage.getItem('tahaddi-ladder-host-room')).toContain('AB12CD34');
    await user.click(screen.getByRole('button', { name: 'خروج' }));
    expect(sessionStorage.getItem('tahaddi-ladder-host-room')).toBeNull();
  });

  it('does not restore a different host account room', () => {
    sessionStorage.setItem('tahaddi-ladder-host-room', JSON.stringify({ hostId: 'other', roomCode: 'AB12CD34' }));
    render(<LadderRoom role="host" hostIdentity={{ hostId: 'host', accessToken: 'token' }} />);
    connectSocket();
    expect(socketMock.emit).not.toHaveBeenCalledWith('ladder:reconnect', expect.anything());
  });

  it('starts only when both contestant slots are filled and shows the real invite QR', async () => {
    const user = userEvent.setup();
    render(<LadderRoom role="host" hostIdentity={{ hostId: 'host', accessToken: 'token' }} />);
    connectSocket();
    const waiting = { roomCode: 'AB12CD34', phase: 'waiting', rightTeam: [{ playerName: 'خالد', isHost: false }], leftTeam: [], isHost: true };
    emitRoomState(waiting);
    expect(screen.getByText('خالد')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /رمز مسح للانضمام/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /بدء اللعبة/ })).toBeDisabled();
    emitRoomState({ ...waiting, leftTeam: [{ playerName: 'فهد', isHost: false }] });
    await user.click(screen.getByRole('button', { name: /بدء اللعبة/ }));
    expect(socketMock.emit).toHaveBeenCalledWith('ladder:start', { roomCode: 'AB12CD34' });
  });

  it('shows the winner and answer history after reconnecting to a finished room', () => {
    render(<LadderRoom />);
    connectSocket();
    emitRoomState({ roomCode: 'AB12CD34', phase: 'finished', currentRound: 10, totalRounds: 10,
      rightScore: 7000, leftScore: 6000, rightPosition: 8, leftPosition: 8, winningPosition: 10,
      currentQuestion: null, rightTeam: [{ playerName: 'خالد', isHost: false }], leftTeam: [{ playerName: 'فهد', isHost: false }], isHost: false,
      winner: 'right', winnerMethod: 'score', roundHistory: [{ roundNumber: 1, questionId: 'q1', questionText: 'ما الإجابة؟', options: [{ id: 'a', text: 'الصواب' }], correctOptionId: 'a',
        right: { optionId: 'a', correct: true, elapsedMs: 1200, points: 1000 }, left: { optionId: null, correct: false, elapsedMs: null, points: -200 } }] });
    expect(screen.getByText('يفوز خالد')).toBeInTheDocument();
    expect(screen.getByText('الحسم بأعلى مجموع نقاط')).toBeInTheDocument();
    expect(screen.getByText(/1.2 ثانية/)).toBeInTheDocument();
    expect(screen.getByText('لم يجب')).toBeInTheDocument();
  });

  it('uses persistent websocket transport for the ladder realtime connection', () => {
    render(<LadderRoom />);
    expect(ioMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ transports: ['websocket'] }),
    );
  });

  it('falls back gracefully when the browser has no session storage', () => {
    // Replace sessionStorage with a throwing object to simulate the
    // case where the host forbids it.
    const originalSessionStorage = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
        clear: () => {
          throw new Error('blocked');
        },
        key: () => null,
        length: 0,
      },
    });

    try {
      render(<LadderRoom />);
      // Even without storage we connect (without auth) so the user can
      // at least see the entry UI; the host/join buttons stay disabled
      // because we never have a valid identity.
      expect(ioMock).toHaveBeenCalledTimes(1);
      const auth = (ioMock.mock.calls[0]?.[1] as { auth?: { guestId?: string } })?.auth;
      expect(auth?.guestId).toBeUndefined();
    } finally {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: originalSessionStorage,
      });
    }
  });
});
