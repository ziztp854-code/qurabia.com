import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChessRoom } from './chess-room';
import { resolveChessRealtimeUrl } from './use-chess-socket';

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

describe('ChessRoom', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    socketMock.emit.mockClear();
    socketMock.disconnect.mockClear();
    socketMock.listeners.clear();
    socketMock.join.mockClear();
    socketMock.leave.mockClear();
    ioMock.mockClear();
    localStorage.clear();
    sessionStorage.clear();
  });

  const connectSocket = () => {
    act(() => {
      socketMock.listeners.get('connect')?.();
    });
  };

  const emitRoomState = (snapshot: unknown) => {
    act(() => {
      socketMock.listeners.get('chess:room:state')?.(snapshot);
    });
  };

  it('shows entry state when no room is joined', () => {
    render(<ChessRoom initialPin="" />);
    expect(screen.getByRole('heading', { name: /تحدي الشطرنج/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إنشاء التحدي/ })).toBeInTheDocument();
  });

  it('shows join form when initialPin is provided', () => {
    render(<ChessRoom initialPin="123456" />);
    expect(screen.getByLabelText('رمز الغرفة')).toHaveValue('123456');
  });

  it('uses same-origin chess realtime on public aliases when a stale Vercel deployment URL was embedded', () => {
    expect(
      resolveChessRealtimeUrl(
        'https://tahaddi-platform-realtime-old-azizs-projects.vercel.app',
        'https://qurabia.com',
      ),
    ).toBe('https://qurabia.com/special-games');
  });

  it('uses the local realtime service when no chess URL is configured during local development', () => {
    expect(resolveChessRealtimeUrl(undefined, 'http://localhost:3100')).toBe(
      'http://localhost:3001/special-games',
    );
  });

  it('uses the persistent websocket transport for chess rooms', () => {
    render(<ChessRoom initialPin="" />);

    expect(ioMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        transports: ['websocket'],
        timeout: 20_000,
      }),
    );
  });

  it('does not treat an intentional socket teardown as a dropped live connection', () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();

    act(() => {
      socketMock.listeners.get('disconnect')?.('io client disconnect');
    });

    expect(
      screen.queryByText('انقطع الاتصال بخدمة اللعب المباشر. حاول مجددًا بعد عودة الاتصال.'),
    ).not.toBeInTheDocument();
  });

  it('shows board when room is playing', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();

    const snapshot = {
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      stateVersion: 0,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 300000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    };

    emitRoomState(snapshot);

    await waitFor(() => {
      expect(screen.getByText('عبدالعزيز')).toBeInTheDocument();
      expect(screen.getByText('محمد')).toBeInTheDocument();
    });
    expect(screen.getByText('حرّك قطعة')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'واجهة مباراة الشطرنج' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'القطع المأسورة' })).toBeInTheDocument();
    expect(screen.getAllByText('غير مصنّف')).toHaveLength(2);
    expect(screen.getAllByText('متصل')).toHaveLength(2);
    expect(screen.getByText('الحركة 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قلب الرقعة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'الإعدادات' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'تراجع' })).toBeDisabled();
    const moveLog = screen.getByRole('complementary', { name: 'سجل النقلات' });
    expect(within(moveLog).getByText('رقم')).toBeInTheDocument();
    expect(within(moveLog).getByText('الأبيض')).toBeInTheDocument();
    expect(within(moveLog).getByText('الأسود')).toBeInTheDocument();

    const settingsButton = screen.getByRole('button', { name: 'الإعدادات' });
    fireEvent.click(settingsButton);
    expect(settingsButton).toHaveAttribute('aria-expanded', 'true');
    const coordinates = screen.getByRole('checkbox', { name: 'إظهار إحداثيات الرقعة' });
    expect(coordinates).toBeChecked();
    fireEvent.click(coordinates);
    expect(
      screen
        .getByRole('grid', { name: 'رقعة الشطرنج الكلاسيكية' })
        .closest('.chess-board-frame'),
    ).toHaveAttribute('data-coordinates', 'hidden');

    const flipButton = screen.getByRole('button', { name: 'قلب الرقعة' });
    fireEvent.click(flipButton);
    expect(flipButton).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen
        .getByRole('grid', { name: 'رقعة الشطرنج الكلاسيكية' })
        .querySelector('[tabindex="0"]'),
    ).toHaveAttribute('data-square', 'h1');
  });

  it('shows captured pieces beside the chess board', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();

    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/R1BQKBNR b KQkq - 0 2',
      turn: 'black',
      stateVersion: 2,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 300000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    });

    const capturedRail = await screen.findByRole('complementary', { name: 'القطع المأسورة' });
    const blackCaptured = within(capturedRail).getByLabelText('قطع الأسود المأسورة');
    const whiteCaptured = within(capturedRail).getByLabelText('قطع الأبيض المأسورة');

    expect(within(blackCaptured).getByLabelText('أسود الجندي')).toBeInTheDocument();
    expect(within(whiteCaptured).getByLabelText('أبيض الحصان')).toBeInTheDocument();
  });

  it('prefers the invite pin over a stale stored room on reconnect', async () => {
    sessionStorage.setItem('tahaddi-chess-room-pin', '111111');
    sessionStorage.setItem('tahaddi-chess-seat-guest-id', 'stored_guest');
    render(<ChessRoom initialPin="654321" />);

    connectSocket();

    await waitFor(() => {
      expect(socketMock.emit).toHaveBeenCalledWith('chess:reconnect', {
        pin: '654321',
        guestId: 'stored_guest',
      });
    });
    expect(socketMock.emit).not.toHaveBeenCalledWith(
      'chess:reconnect',
      expect.objectContaining({ pin: '111111' }),
    );
  });

  it('loads a resumable room after hydration without reopening it automatically', async () => {
    sessionStorage.setItem('tahaddi-chess-room-pin', '111111');
    sessionStorage.setItem('tahaddi-chess-seat-guest-id', 'stored_guest');

    const serverMarkup = renderToString(<ChessRoom initialPin="" />);
    expect(serverMarkup).not.toContain('استكمال آخر غرفة');

    render(<ChessRoom initialPin="" />);
    connectSocket();

    expect(screen.getByRole('heading', { name: /تحدي الشطرنج/ })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /استكمال آخر غرفة \(111111\)/ }),
    ).toBeInTheDocument();
    expect(socketMock.emit).not.toHaveBeenCalledWith('chess:reconnect', expect.anything());
  });

  it('does not show resume when the saved room has no stored seat identity', () => {
    sessionStorage.setItem('tahaddi-chess-room-pin', '111111');
    render(<ChessRoom initialPin="" />);

    connectSocket();

    expect(screen.queryByRole('button', { name: /استكمال آخر غرفة/ })).not.toBeInTheDocument();
    expect(socketMock.emit).not.toHaveBeenCalledWith('chess:reconnect', expect.anything());
  });

  it('does not show resume when the saved room pin is invalid', () => {
    sessionStorage.setItem('tahaddi-chess-room-pin', '111111<script>');
    sessionStorage.setItem('tahaddi-chess-seat-guest-id', 'stored_guest');
    render(<ChessRoom initialPin="" />);

    connectSocket();

    expect(screen.queryByRole('button', { name: /استكمال آخر غرفة/ })).not.toBeInTheDocument();
    expect(socketMock.emit).not.toHaveBeenCalledWith('chess:reconnect', expect.anything());
  });

  it('resumes a saved room only after the player asks for it', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('tahaddi-chess-room-pin', '111111');
    sessionStorage.setItem('tahaddi-chess-seat-guest-id', 'stored_guest');
    render(<ChessRoom initialPin="" />);
    connectSocket();

    await user.click(
      await screen.findByRole('button', { name: /استكمال آخر غرفة \(111111\)/ }),
    );

    expect(socketMock.emit).toHaveBeenCalledWith('chess:reconnect', {
      pin: '111111',
      guestId: 'stored_guest',
    });
  });

  it('unblocks room actions when the realtime socket disconnects after a request', async () => {
    const user = userEvent.setup();
    render(<ChessRoom initialPin="" />);
    connectSocket();

    await user.type(screen.getByLabelText('اسمك'), 'عبدالعزيز');
    const createButton = screen.getByRole('button', { name: /إنشاء التحدي/ });
    await user.click(createButton);

    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute('aria-busy', 'true');

    act(() => {
      socketMock.listeners.get('disconnect')?.();
    });

    expect(createButton).toBeDisabled();
    expect(createButton).not.toHaveAttribute('aria-busy');
    expect(
      screen.getByText('انقطع الاتصال بخدمة اللعب المباشر. حاول مجددًا بعد عودة الاتصال.'),
    ).toBeInTheDocument();
  });

  it('reattaches an active chess room after the realtime socket reconnects', async () => {
    render(<ChessRoom initialPin="" />);
    const configuredGuestId = (ioMock.mock.calls[0]?.[1] as { auth?: { guestId?: string } })?.auth
      ?.guestId;
    connectSocket();
    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      stateVersion: 0,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 300000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
      yourGuestId: 'seat_guest',
    });
    socketMock.emit.mockClear();

    act(() => {
      socketMock.listeners.get('disconnect')?.();
      socketMock.listeners.get('connect')?.();
    });

    await waitFor(() => {
      expect(socketMock.emit).toHaveBeenCalledWith('chess:reconnect', {
        pin: '123456',
        guestId: configuredGuestId,
      });
    });
  });

  it('reattaches a spectator to room broadcasts after the realtime socket reconnects', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();
    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      stateVersion: 0,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 300000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 1,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: false,
      yourColor: null,
      yourRole: 'spectator',
      yourGuestId: null,
    });
    socketMock.emit.mockClear();

    act(() => {
      socketMock.listeners.get('disconnect')?.();
      socketMock.listeners.get('connect')?.();
    });

    await waitFor(() => {
      expect(socketMock.emit).toHaveBeenCalledWith('chess:spectate', {
        pin: '123456',
      });
    });
  });

  it('shows a recoverable error when a room request receives no server response', async () => {
    vi.useFakeTimers();
    render(<ChessRoom initialPin="" />);
    connectSocket();

    fireEvent.change(screen.getByLabelText('اسمك'), { target: { value: 'عبدالعزيز' } });
    fireEvent.click(screen.getByRole('button', { name: /إنشاء التحدي/ }));

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(
      screen.getByText('لم يصل رد الغرفة. تحقق من الاتصال ثم حاول مرة أخرى.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إنشاء التحدي/ })).not.toHaveAttribute('aria-busy');
  });

  it('keeps an accessible keyboard grid for the two-dimensional board', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();
    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      stateVersion: 0,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 300000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    });

    const board = await screen.findByLabelText('رقعة الشطرنج الكلاسيكية');
    const squares = Array.from(board.querySelectorAll<HTMLButtonElement>('.chess-square'));
    expect(within(board).getAllByRole('row')).toHaveLength(8);
    expect(within(board).getAllByRole('gridcell')).toHaveLength(64);
    expect(squares).toHaveLength(64);
    expect(squares.filter((square) => square.tabIndex === 0)).toHaveLength(1);
    expect(squares.filter((square) => square.tabIndex === -1)).toHaveLength(63);

    const a8 = board.querySelector<HTMLButtonElement>('[data-square="a8"]')!;
    const b8 = board.querySelector<HTMLButtonElement>('[data-square="b8"]')!;
    const b7 = board.querySelector<HTMLButtonElement>('[data-square="b7"]')!;
    a8.focus();
    fireEvent.keyDown(a8, { key: 'ArrowRight' });
    expect(b8).toHaveFocus();
    fireEvent.keyDown(b8, { key: 'ArrowDown' });
    expect(b7).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'ثلاثي الأبعاد' })).not.toBeInTheDocument();
  });

  it('orients the board around the player and labels the active side accurately', async () => {
    const { container } = render(<ChessRoom initialPin="" />);
    connectSocket();

    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
      turn: 'black',
      stateVersion: 0,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 298000 },
      blackClock: { remainingMs: 297000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    });

    const board = await screen.findByLabelText('رقعة الشطرنج الكلاسيكية');
    const opponent = container.querySelector<HTMLElement>('[data-player-color="black"]');
    const player = container.querySelector<HTMLElement>('[data-player-color="white"]');

    expect(board).toHaveAttribute('dir', 'ltr');
    expect(opponent).not.toBeNull();
    expect(player).not.toBeNull();
    expect(
      opponent!.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(board.compareDocumentPosition(player!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(opponent!).getByText('دور المنافس')).toBeInTheDocument();
    expect(within(player!).queryByText('دورك')).not.toBeInTheDocument();
    expect(board.querySelectorAll('.chess-board__coord')).toHaveLength(0);
    expect(
      board.closest('.chess-board-frame')?.querySelectorAll('.chess-board-frame__file'),
    ).toHaveLength(8);
    expect(
      board.closest('.chess-board-frame')?.querySelectorAll('.chess-board-frame__rank'),
    ).toHaveLength(8);
    expect(
      screen
        .getByRole('button', { name: /أسود الرخ في a8/ })
        .querySelector('.chess-piece-model'),
    ).toHaveClass('chess-piece-model--black');
    expect(
      screen
        .getByRole('button', { name: /أبيض الرخ في a1/ })
        .querySelector('.chess-piece-model'),
    ).toHaveClass('chess-piece-model--white');
    expect(board.querySelectorAll('.chess-piece-model')).toHaveLength(32);
    expect(board.closest('.chess-board-frame')).not.toBeNull();
    expect(board.closest('.chess-board-frame')).toHaveAttribute('data-material', 'coal');
    // The reference plate draws every knight facing the same way, so neither
    // knight is mirrored.
    for (const square of ['b1', 'g1']) {
      expect(
        screen
          .getByRole('button', { name: new RegExp(`أبيض الحصان في ${square}`) })
          .querySelector('.chess-piece-model'),
      ).not.toHaveClass('chess-piece-model--mirror');
    }
    expect(screen.getByText('ستظهر النقلات هنا بعد بدء اللعب.')).toBeInTheDocument();
  });

  it('lets the black player select a legal move on the flipped board', async () => {
    const user = userEvent.setup();
    render(<ChessRoom initialPin="" />);
    connectSocket();

    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      turn: 'black',
      stateVersion: 1,
      moves: [{ san: 'e4', from: 'e2', to: 'e4', fen: '', timestamp: 0, by: 'white' }],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 298000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: { from: 'e2', to: 'e4', san: 'e4' },
      result: null,
      drawOffer: null,
      isHost: false,
      yourColor: 'black',
      yourRole: 'black',
    });

    const source = await screen.findByRole('button', { name: /أسود الجندي في e7/ });
    const destination = screen.getByRole('button', { name: /مربع e5/ });

    const board = screen.getByRole('grid', { name: 'رقعة الشطرنج الكلاسيكية' });
    const firstVisualSquare = board.querySelector<HTMLButtonElement>('[tabindex="0"]');
    expect(firstVisualSquare).toHaveAttribute('data-square', 'h1');
    firstVisualSquare!.focus();
    fireEvent.keyDown(firstVisualSquare!, { key: 'ArrowRight' });
    const g1 = board.querySelector<HTMLButtonElement>('[data-square="g1"]')!;
    expect(g1).toHaveFocus();
    fireEvent.keyDown(g1, { key: 'ArrowDown' });
    expect(board.querySelector('[data-square="g2"]')).toHaveFocus();

    socketMock.emit.mockClear();
    source.focus();
    await user.keyboard('{Enter}');

    expect(source).toHaveClass('selected');
    expect(destination).toHaveClass('legal');
    expect(source.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
    expect(destination).toHaveAccessibleName(/نقلة قانونية/);
    expect(screen.getByRole('button', { name: /أبيض الجندي في e4، آخر نقلة/ })).toBeInTheDocument();

    destination.focus();
    await user.keyboard(' ');
    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith('chess:move', {
      pin: '123456',
      from: 'e7',
      to: 'e5',
      expectedVersion: 1,
    });
  });

  it('names capture targets and a checked king without changing move validation', async () => {
    const user = userEvent.setup();
    render(<ChessRoom initialPin="" />);
    connectSocket();

    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
      turn: 'white',
      stateVersion: 0,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 300000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    });

    const source = await screen.findByRole('button', { name: /أبيض الجندي في e4/ });
    await user.click(source);
    expect(
      screen.getByRole('button', { name: /أسود الجندي في d5، نقلة قانونية للأخذ/ }),
    ).toBeInTheDocument();

    emitRoomState({
      pin: '123456',
      phase: 'playing',
      fen: '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',
      turn: 'white',
      stateVersion: 1,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 300000 },
      blackClock: { remainingMs: 300000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: { from: 'e8', to: 'e2', san: 'Re2+' },
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    });

    expect(await screen.findByRole('button', { name: /أبيض الملك في e1، كش/ })).toBeInTheDocument();
  });

  it('keeps the checkmated king identified in a finished position', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();

    emitRoomState({
      pin: '123456',
      phase: 'finished',
      fen: '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',
      turn: 'black',
      stateVersion: 4,
      moves: [],
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
      whiteClock: { remainingMs: 280000 },
      blackClock: { remainingMs: 270000 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: { from: 'f6', to: 'g7', san: 'Qg7#' },
      result: { reason: 'checkmate', winner: 'white', endedAt: Date.now() },
      drawOffer: null,
      isHost: true,
      yourColor: 'black',
      yourRole: 'black',
    });

    const board = await screen.findByRole('grid', { name: 'رقعة الشطرنج الكلاسيكية' });
    expect(board).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('button', { name: /أسود الملك في h8، كش مات/ })).toHaveClass(
      'in-checkmate',
    );
  });

  it('shows promotion dialog after clicking a promotion square', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();

    const snapshot = {
      pin: '123456',
      phase: 'playing',
      fen: '8/7P/8/8/8/8/8/4k2K w - - 0 1',
      turn: 'white',
      stateVersion: 1,
      moves: [],
      timeControl: { initialSeconds: 0, incrementSeconds: 0 },
      whiteClock: { remainingMs: 0 },
      blackClock: { remainingMs: 0 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    };

    emitRoomState(snapshot);

    await waitFor(() => {
      expect(screen.getByText('عبدالعزيز')).toBeInTheDocument();
    });

    const h7Square = screen.getByRole('button', { name: /h7/ });
    await userEvent.click(h7Square);

    const h8Square = screen.getByRole('button', { name: /h8/ });
    await userEvent.click(h8Square);

    await waitFor(() => {
      expect(screen.getByText('ترقية الجندي')).toBeInTheDocument();
    });
  });

  it('shows result screen after game ends', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();

    const snapshot = {
      pin: '123456',
      phase: 'finished',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      stateVersion: 1,
      moves: [{ san: 'e4', from: 'e2', to: 'e4', fen: '', timestamp: 0, by: 'white' as const }],
      timeControl: { initialSeconds: 0, incrementSeconds: 0 },
      whiteClock: { remainingMs: 0 },
      blackClock: { remainingMs: 0 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: { reason: 'checkmate', winner: 'white', endedAt: Date.now() },
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    };

    emitRoomState(snapshot);

    act(() => {
      socketMock.listeners.get('chess:game:end')?.({
        reason: 'checkmate',
        winner: 'white',
        durationMs: 60000,
        moveCount: 1,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('كش مات')).toBeInTheDocument();
      expect(screen.getByText('يفوز بالتحدي')).toBeInTheDocument();
      const turnBanner = document.querySelector('.chess-turn-banner');
      expect(turnBanner).toHaveTextContent('انتهت المباراة');
      expect(turnBanner).not.toHaveAttribute('data-self-turn');
      expect(screen.getByRole('button', { name: 'مباراة جديدة' })).toHaveFocus();
      expect(screen.getByRole('button', { name: 'العودة للألعاب' })).toBeInTheDocument();
      expect(document.querySelector('.chess-play-grid')).toHaveAttribute('inert');
    });
  });

  it('renders move history with paired moves', async () => {
    render(<ChessRoom initialPin="" />);
    connectSocket();

    const snapshot = {
      pin: '123456',
      phase: 'playing',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'black',
      stateVersion: 2,
      moves: [
        { san: 'e4', from: 'e2', to: 'e4', fen: '', timestamp: 0, by: 'white' as const },
        { san: 'e5', from: 'e7', to: 'e5', fen: '', timestamp: 0, by: 'black' as const },
      ],
      timeControl: { initialSeconds: 0, incrementSeconds: 0 },
      whiteClock: { remainingMs: 0 },
      blackClock: { remainingMs: 0 },
      seats: {
        white: { name: 'عبدالعزيز', connected: true },
        black: { name: 'محمد', connected: true },
      },
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      isHost: true,
      yourColor: 'white',
      yourRole: 'white',
    };

    emitRoomState(snapshot);

    await waitFor(() => {
      const whiteMoves = screen.getAllByText('e4');
      const blackMoves = screen.getAllByText('e5');
      expect(whiteMoves.length).toBeGreaterThanOrEqual(1);
      expect(blackMoves.length).toBeGreaterThanOrEqual(1);
    });
  });
});
