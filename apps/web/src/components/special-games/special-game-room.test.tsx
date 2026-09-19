import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPECIAL_GAME_META, SPECIAL_GAME_ORDER } from '@tahaddi/domain';
import { resolveSpecialGamesRealtimeUrl, SpecialGameRoom } from './special-game-room';

const ioMock = vi.hoisted(() => vi.fn());

const socketMock = vi.hoisted(() => {
  const listeners = new Map<string, (...args: never[]) => void>();
  return {
    id: 'socket-host',
    listeners,
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, listener);
    }),
  };
});

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => {
    ioMock(...args);
    return socketMock;
  },
}));

describe('SpecialGameRoom', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    socketMock.emit.mockClear();
    socketMock.disconnect.mockClear();
    socketMock.listeners.clear();
    ioMock.mockClear();
    localStorage.clear();
  });

  it('normalizes a configured realtime URL for the special-games namespace', () => {
    expect(
      resolveSpecialGamesRealtimeUrl(
        '  https://realtime.example.com///  ',
        'https://tahaddi.example.com',
      ),
    ).toBe('https://realtime.example.com/special-games');
  });

  it('falls back to the production origin when a loopback realtime URL was embedded', () => {
    expect(
      resolveSpecialGamesRealtimeUrl('http://localhost:3001', 'https://tahaddi.example.com'),
    ).toBe('https://tahaddi.example.com/special-games');
  });

  it('keeps public aliases on same-origin realtime when a stale Vercel deployment URL was embedded', () => {
    expect(
      resolveSpecialGamesRealtimeUrl(
        'https://tahaddi-platform-realtime-old-azizs-projects.vercel.app',
        'https://qurabia.com',
      ),
    ).toBe('https://qurabia.com/special-games');
  });

  it('uses the local realtime service when no URL is configured during local development', () => {
    expect(resolveSpecialGamesRealtimeUrl(undefined, 'http://localhost:3100')).toBe(
      'http://localhost:3001/special-games',
    );
  });

  it('uses the configured realtime service when rendering locally', () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', ' http://127.0.0.1:3001/ ');

    render(<SpecialGameRoom mode={SPECIAL_GAME_ORDER[0]} initialPin="" />);

    expect(ioMock).toHaveBeenCalledWith('http://127.0.0.1:3001/special-games', expect.any(Object));
  });

  it('shows the first room mode rules and creates a room after connecting', async () => {
    const user = userEvent.setup();
    const mode = SPECIAL_GAME_ORDER[0];
    render(<SpecialGameRoom mode={mode} initialPin="" />);

    expect(
      screen.getByRole('heading', { name: SPECIAL_GAME_META[mode].title }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 لاعبين')).toBeInTheDocument();
    expect(ioMock).toHaveBeenCalledWith(
      'http://localhost:3001/special-games',
      expect.objectContaining({
        transports: ['websocket'],
      }),
    );

    socketMock.listeners.get('connect')?.();
    await user.click(screen.getByRole('button', { name: /أنشئ الغرفة/ }));

    expect(socketMock.emit).toHaveBeenCalledWith('special:room:create', {
      mode,
    });
  });

  it('sends only the signed token after the host reviews and approves Grok content', async () => {
    const user = userEvent.setup();
    const mode = SPECIAL_GAME_ORDER[0];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ok: true,
          approvalToken: 'signed-draft-token',
          draft: {
            game: mode,
            content: { rounds: [{ answer: 'الرياض' }, { answer: 'جدة' }, { answer: 'أبها' }] },
          },
        }),
      }),
    );
    render(<SpecialGameRoom mode={mode} initialPin="" />);
    socketMock.listeners.get('connect')?.();

    await user.type(screen.getByLabelText('موضوع محتوى Grok (اختياري)'), 'مدن السعودية');
    await user.click(screen.getByRole('button', { name: /ولّد مسودة/ }));
    await user.click(await screen.findByRole('button', { name: /اعتمد المحتوى/ }));
    await user.click(screen.getByRole('button', { name: /أنشئ الغرفة/ }));

    expect(socketMock.emit).toHaveBeenCalledWith('special:room:create', {
      mode,
      contentToken: 'signed-draft-token',
    });
  });

  it('prefills a QR invitation code and submits a player name', async () => {
    const user = userEvent.setup();
    render(<SpecialGameRoom mode={SPECIAL_GAME_ORDER[1]} initialPin="123456" />);
    socketMock.listeners.get('connect')?.();

    await user.type(screen.getByLabelText('اسم اللاعب'), 'نورة');
    await user.click(screen.getByRole('button', { name: /ادخل الغرفة/ }));

    expect(socketMock.emit).toHaveBeenCalledWith('special:room:join', {
      pin: '123456',
      playerName: 'نورة',
    });
  });

  it('shows an actionable offline state when the realtime connection fails', () => {
    render(<SpecialGameRoom mode={SPECIAL_GAME_ORDER[0]} initialPin="" />);

    act(() => {
      socketMock.listeners.get('connect_error')?.();
    });

    expect(screen.getByText('انقطع الاتصال — جارٍ المحاولة مجددًا')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'تعذّر الاتصال بخدمة اللعب المباشر. تحقق من اتصالك ثم أعد تحميل الصفحة.',
    );
    expect(screen.getByRole('button', { name: /أنشئ الغرفة/ })).toBeDisabled();
  });

  it('renders a scannable QR invitation after the room is created', () => {
    render(<SpecialGameRoom mode={SPECIAL_GAME_ORDER[0]} initialPin="" />);

    act(() => {
      socketMock.listeners.get('connect')?.();
      socketMock.listeners.get('special:room:state')?.({
        pin: '654321',
        hostId: 'socket-host',
        mode: SPECIAL_GAME_ORDER[0],
        phase: 'lobby',
        roundIndex: 0,
        roundCount: 6,
        players: [],
      } as never);
    });

    expect(screen.getByLabelText('رمز QR للانضمام إلى الغرفة 654321')).toBeInTheDocument();
    expect(screen.getByText('654321')).toBeInTheDocument();
  });

  it('shows a live risk room with a host code and lets only the active player choose', () => {
    render(<SpecialGameRoom mode="risk" initialPin="" />);

    act(() => {
      socketMock.listeners.get('connect')?.();
      socketMock.listeners.get('special:room:state')?.({
        pin: '246810',
        hostId: 'host-socket',
        mode: 'risk',
        phase: 'risk-turn',
        roundIndex: 0,
        roundCount: 5,
        players: [
          { id: 'socket-host', name: 'سارة', score: 0 },
          { id: 'player-2', name: 'فيصل', score: 0 },
        ],
        readyPlayerIds: [],
      } as never);
      socketMock.listeners.get('risk:state')?.({
        roundNumber: 1,
        roundCount: 5,
        activePlayerId: 'socket-host',
        pot: 0,
        shield: false,
        doubleNext: false,
        awaitingDecision: false,
        message: 'اختر بطاقة مخفية.',
        cards: Array.from({ length: 24 }, (_, index) => ({
          id: `risk-card-${index + 1}`,
          revealed: false,
        })),
      } as never);
    });

    const cards = screen.getAllByRole('button', { name: 'بطاقة مخفية' });
    expect(cards).toHaveLength(24);
    expect(cards[0]).toHaveTextContent('تحدّي');
    expect(cards[0]).toBeEnabled();
    fireEvent.click(cards[0]!);
    expect(socketMock.emit).toHaveBeenCalledWith('risk:card:select', {
      pin: '246810',
      cardId: 'risk-card-1',
    });

    act(() => {
      socketMock.listeners.get('risk:state')?.({
        roundNumber: 1,
        roundCount: 5,
        activePlayerId: 'player-2',
        pot: 0,
        shield: false,
        doubleNext: false,
        awaitingDecision: false,
        message: 'دور فيصل.',
        cards: Array.from({ length: 24 }, (_, index) => ({
          id: `risk-card-${index + 1}`,
          revealed: false,
        })),
      } as never);
    });
    expect(screen.getAllByRole('button', { name: 'بطاقة مخفية' })[0]).toBeDisabled();
  });

  it('restores a saved risk session after the socket reconnects', () => {
    const resumeToken = crypto.randomUUID();
    localStorage.setItem(
      'tahaddi-special-session-risk',
      JSON.stringify({ pin: '246810', token: resumeToken }),
    );
    render(<SpecialGameRoom mode="risk" initialPin="" />);

    act(() => socketMock.listeners.get('connect')?.());

    expect(socketMock.emit).toHaveBeenCalledWith('risk:room:resume', {
      pin: '246810',
      token: resumeToken,
    });
  });

  it('keeps the third room mode role private and submits the assigned answer', async () => {
    const user = userEvent.setup();
    const mode = SPECIAL_GAME_ORDER[2];
    render(<SpecialGameRoom mode={mode} initialPin="" />);

    act(() => {
      socketMock.listeners.get('connect')?.();
      socketMock.listeners.get('special:room:state')?.({
        pin: '112233',
        hostId: 'host-socket',
        mode,
        phase: 'infiltrator-answering',
        roundIndex: 0,
        roundCount: 6,
        players: [
          { id: 'socket-host', name: 'سارة', score: 0 },
          { id: 'p2', name: 'فيصل', score: 0 },
          { id: 'p3', name: 'نور', score: 0 },
          { id: 'p4', name: 'عمر', score: 0 },
        ],
      } as never);
      socketMock.listeners.get('infiltrator:round')?.({
        roundId: 'parallel-cairo',
        roundNumber: 1,
        roundCount: 6,
        prompt: 'ما عاصمة المملكة العربية السعودية؟',
        options: ['الرياض', 'جدة', 'الدمام', 'أبها'],
        isInfiltrator: true,
        startsAt: Date.now(),
        timeLimit: 45,
      } as never);
    });

    // The secret role stays hidden behind a face-down card until the
    // player flips it — the dialog never names the role up front.
    const dialog = screen.getByRole('dialog', { name: /بطاقتك السرية/ });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'اكشف دورك السري' }));
    await user.click(screen.getByRole('button', { name: /فهمت/ }));

    expect(screen.getByText('أنت الدخيل')).toBeInTheDocument();
    expect(screen.getByText(/تظاهر أن سؤالك/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'الرياض' }));

    expect(socketMock.emit).toHaveBeenCalledWith('infiltrator:answer:submit', {
      pin: '112233',
      roundId: 'parallel-cairo',
      answer: 'الرياض',
    });
  });
});
