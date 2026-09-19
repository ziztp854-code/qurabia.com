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
      screen.getByText('هوية الضيف السابقة انتهت. أنشئ هوية جديدة للمتابعة دون فقدان التقدم.'),
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
