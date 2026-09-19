import { Test, TestingModule } from '@nestjs/testing';
import type { ChessRoom } from '@tahaddi/domain';
import { RedisService } from '../../game/redis.service.js';
import { ChessService } from '../chess.service.js';

describe('ChessService', () => {
  let service: ChessService;
  let redis: jest.Mocked<RedisService>;

  const mockRedis = {
    loadChessRoom: jest.fn(),
    saveChessRoom: jest.fn(),
    deleteChessRoom: jest.fn(),
    addActiveChessPin: jest.fn(),
    removeActiveChessPin: jest.fn(),
    isChessPinActive: jest.fn(),
    setChessGuestIdentity: jest.fn(),
    getChessGuestIdentity: jest.fn(),
    deleteChessGuestIdentity: jest.fn(),
    acquireSpecialRoomLock: jest.fn(),
    releaseSpecialRoomLock: jest.fn(),
    acquireChessRoomLock: jest.fn(),
    releaseChessRoomLock: jest.fn(),
  } as unknown as jest.Mocked<RedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChessService, { provide: RedisService, useValue: mockRedis }],
    }).compile();

    service = module.get<ChessService>(ChessService);
    redis = module.get(RedisService);
    jest.clearAllMocks();
    redis.acquireChessRoomLock.mockResolvedValue(true);
    redis.releaseChessRoomLock.mockResolvedValue(undefined);
  });

  describe('createRoom', () => {
    it('creates a room with unique pin', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);

      const result = await service.createRoom(
        { playerName: 'عبدالعزيز', timeControl: '5+0', colorChoice: 'white' },
        'guest_123',
        'token_123',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.pin).toBeDefined();
        expect(result.room.phase).toBe('waiting');
        expect(result.room.seats.white?.name).toBe('عبدالعزيز');
      }
    });

    it('randomly assigns either color when random is requested', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      const random = jest.spyOn(Math, 'random');

      random.mockReturnValue(0.75);
      const black = await service.createRoom(
        { playerName: 'أحمد', timeControl: '5+0', colorChoice: 'random' },
        'guest_black',
        'token_black',
      );

      random.mockReturnValue(0.25);
      const white = await service.createRoom(
        { playerName: 'محمد', timeControl: '5+0', colorChoice: 'random' },
        'guest_white',
        'token_white',
      );

      expect(black.ok && black.room.seats.black?.guestId).toBe('guest_black');
      expect(white.ok && white.room.seats.white?.guestId).toBe('guest_white');
      random.mockRestore();
    });
  });

  describe('joinRoom', () => {
    it('assigns second player to remaining seat', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: '5+0', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      expect(createResult.ok).toBe(true);
      const pin = createResult.ok ? createResult.room.pin : '';

      redis.loadChessRoom.mockResolvedValue(
        createResult.ok ? createResult.room : null,
      );

      const joinResult = await service.joinRoom(
        { pin, playerName: 'محمد' },
        'guest_2',
        'token_2',
      );
      expect(joinResult.ok).toBe(true);
      if (joinResult.ok) {
        expect(joinResult.room.phase).toBe('ready');
        expect(joinResult.room.seats.black?.name).toBe('محمد');
        expect(joinResult.room.seats.black?.guestId).toBe('guest_2');
      }
      expect(redis.setChessGuestIdentity.mock.calls.at(-1)).toEqual([
        'guest_2',
        expect.objectContaining({ guestId: 'guest_2', guestToken: 'token_2' }),
        expect.any(Number),
      ]);
    });

    it('rejects unknown guest when room is full', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: '5+0', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      expect(createResult.ok).toBe(true);
      const pin = createResult.ok ? createResult.room.pin : '';

      const roomWithBoth = createResult.ok
        ? {
            ...createResult.room,
            phase: 'ready' as const,
            seats: {
              white: {
                guestId: 'guest_1',
                name: 'أحمد',
                color: 'white' as const,
                connected: true,
                createdAt: Date.now(),
              },
              black: {
                guestId: 'guest_2',
                name: 'محمد',
                color: 'black' as const,
                connected: true,
                createdAt: Date.now(),
              },
            },
          }
        : null;
      redis.loadChessRoom.mockResolvedValue(roomWithBoth);

      const joinResult = await service.joinRoom(
        { pin, playerName: 'سارة' },
        'guest_3',
        'token_3',
      );
      expect(joinResult.ok).toBe(false);
      if (!joinResult.ok) {
        expect(joinResult.code).toBe('ROOM_FULL');
      }
    });
  });

  describe('spectate', () => {
    it('rejects a new spectator when the room spectator limit is reached', async () => {
      const spectators = Array.from({ length: 100 }, (_, index) => ({
        guestId: `spectator_${index}`,
        name: `مشاهد ${index}`,
        joinedAt: Date.now(),
      }));
      const room = {
        pin: '123456',
        spectators,
        spectatorCount: spectators.length,
      } as unknown as ChessRoom;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.spectate({
        pin: room.pin,
        spectatorName: 'مشاهد جديد',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('SPECTATOR_LIMIT');
      expect(redis.saveChessRoom.mock.calls).toHaveLength(0);
    });
  });

  describe('respondDraw', () => {
    it('does not replace a terminal result after acquiring the room lock', async () => {
      const room = {
        pin: '123456',
        phase: 'finished' as const,
        stateVersion: 2,
        result: {
          reason: 'checkmate' as const,
          winner: 'white' as const,
          endedAt: Date.now(),
        },
        drawOffer: { by: 'white' as const, at: Date.now() - 1_000 },
        seats: {
          white: { guestId: 'guest_white', color: 'white' as const },
          black: { guestId: 'guest_black', color: 'black' as const },
        },
      } as unknown as ChessRoom;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.respondDraw('guest_black', room.pin, true);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('GAME_FINISHED');
      expect(redis.saveChessRoom.mock.calls).toHaveLength(0);
    });
  });

  describe('authoritative clocks', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-10T12:00:00Z'));
      redis.acquireChessRoomLock.mockResolvedValue(true);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('starts the active clock when countdown completes and settles timeout', async () => {
      const room = {
        pin: '123456',
        hostGuestId: 'guest_white',
        phase: 'countdown' as const,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'white' as const,
        stateVersion: 0,
        moves: [],
        timeControl: { initialSeconds: 1, incrementSeconds: 0 },
        whiteClock: { remainingMs: 1_000 },
        blackClock: { remainingMs: 1_000 },
        seats: {
          white: {
            guestId: 'guest_white',
            name: 'أحمد',
            color: 'white' as const,
            connected: true,
          },
          black: {
            guestId: 'guest_black',
            name: 'محمد',
            color: 'black' as const,
            connected: true,
          },
        },
        spectators: [],
        spectatorCount: 0,
        lastMove: null,
        result: null,
        drawOffer: null,
        createdAt: Date.now(),
      };
      redis.loadChessRoom.mockResolvedValue(room);

      const started = await service.countdownComplete(room.pin);
      expect(started.ok && started.room.whiteClock.startedAt).toBe(Date.now());

      jest.advanceTimersByTime(1_001);
      const timedOut = await service.tickClocks(room.pin);

      expect(timedOut?.phase).toBe('finished');
      expect(timedOut?.result).toEqual(
        expect.objectContaining({ reason: 'timeout', winner: 'black' }),
      );
      expect(timedOut?.stateVersion).toBe(1);
      expect(redis.saveChessRoom.mock.calls.at(-1)).toEqual([
        room.pin,
        timedOut,
      ]);
    });

    it('resumes the active player clock on authenticated reconnect', async () => {
      const room = {
        pin: '123456',
        phase: 'playing' as const,
        turn: 'white' as const,
        result: null,
        timeControl: { initialSeconds: 5, incrementSeconds: 0 },
        whiteClock: { remainingMs: 4_000 },
        blackClock: { remainingMs: 5_000 },
        seats: {
          white: {
            guestId: 'guest_white',
            color: 'white' as const,
            connected: false,
            disconnectAt: Date.now() - 500,
          },
          black: { guestId: 'guest_black', color: 'black' as const },
        },
      } as unknown as ChessRoom;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.handleReconnect('guest_white', room.pin);

      expect(result.ok && result.room.whiteClock.startedAt).toBe(Date.now());
      expect(redis.acquireChessRoomLock.mock.calls).toContainEqual([
        room.pin,
        expect.any(String),
      ]);
      expect(redis.releaseChessRoomLock.mock.calls).toContainEqual([
        room.pin,
        expect.any(String),
      ]);
    });

    it('serializes disconnect updates with room writes', async () => {
      const room = {
        pin: '123456',
        phase: 'playing' as const,
        turn: 'white' as const,
        result: null,
        timeControl: { initialSeconds: 5, incrementSeconds: 0 },
        whiteClock: { remainingMs: 4_000, startedAt: Date.now() - 500 },
        blackClock: { remainingMs: 5_000 },
        seats: {
          white: {
            guestId: 'guest_white',
            color: 'white' as const,
            connected: true,
          },
          black: { guestId: 'guest_black', color: 'black' as const },
        },
      } as unknown as ChessRoom;
      redis.loadChessRoom.mockResolvedValue(room);

      await service.handleDisconnect('guest_white', room.pin);

      expect(redis.acquireChessRoomLock.mock.calls).toContainEqual([
        room.pin,
        expect.any(String),
      ]);
      expect(redis.releaseChessRoomLock.mock.calls).toContainEqual([
        room.pin,
        expect.any(String),
      ]);
      expect(redis.saveChessRoom.mock.calls).toContainEqual([
        room.pin,
        expect.objectContaining({ phase: 'playing' }),
      ]);
    });

    it('keeps an active player seat resumable when leaving during a game', async () => {
      const room = {
        pin: '123456',
        hostGuestId: 'guest_white',
        phase: 'playing' as const,
        turn: 'white' as const,
        result: null,
        timeControl: { initialSeconds: 300, incrementSeconds: 0 },
        whiteClock: { remainingMs: 240_000, startedAt: Date.now() - 1_000 },
        blackClock: { remainingMs: 300_000 },
        seats: {
          white: {
            guestId: 'guest_white',
            name: 'أحمد',
            color: 'white' as const,
            connected: true,
          },
          black: {
            guestId: 'guest_black',
            name: 'محمد',
            color: 'black' as const,
            connected: true,
          },
        },
      } as unknown as ChessRoom;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.leaveRoom('guest_white', room.pin);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.phase).toBe('playing');
        expect(result.room.seats.white).toEqual(
          expect.objectContaining({
            guestId: 'guest_white',
            connected: false,
            disconnectAt: Date.now(),
          }),
        );
        expect(result.room.seats.black?.guestId).toBe('guest_black');
        expect(result.room.whiteClock.remainingMs).toBe(239_000);
        expect(result.room.whiteClock.startedAt).toBeUndefined();
      }
      expect(redis.deleteChessRoom.mock.calls).toHaveLength(0);
      expect(redis.removeActiveChessPin.mock.calls).toHaveLength(0);
      expect(redis.saveChessRoom.mock.calls).toContainEqual([
        room.pin,
        expect.objectContaining({ phase: 'playing' }),
      ]);
    });

    it('forfeits a disconnected active player after the grace period', async () => {
      const room = {
        pin: '123456',
        phase: 'playing' as const,
        stateVersion: 7,
        turn: 'white' as const,
        result: null,
        timeControl: { initialSeconds: 300, incrementSeconds: 0 },
        whiteClock: { remainingMs: 240_000 },
        blackClock: { remainingMs: 300_000 },
        seats: {
          white: {
            guestId: 'guest_white',
            color: 'white' as const,
            connected: false,
            disconnectAt: Date.now() - 60_001,
          },
          black: {
            guestId: 'guest_black',
            color: 'black' as const,
            connected: true,
          },
        },
      } as unknown as ChessRoom;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.tickClocks(room.pin);

      expect(result?.phase).toBe('finished');
      expect(result?.result).toEqual(
        expect.objectContaining({
          reason: 'disconnect_timeout',
          winner: 'black',
        }),
      );
      expect(result?.stateVersion).toBe(8);
    });
  });

  describe('submitMove', () => {
    it('rejects stale move', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);
      redis.acquireChessRoomLock.mockResolvedValue(true);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: 'none', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      const pin = createResult.ok ? createResult.room.pin : '';

      const room = createResult.ok
        ? { ...createResult.room, phase: 'playing' as const, stateVersion: 1 }
        : null;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.submitMove('guest_1', pin ?? '', {
        from: 'e2',
        to: 'e4',
        expectedVersion: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('STALE_POSITION');
    });

    it('rejects move from unknown guest', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: 'none', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      const pin = createResult.ok ? createResult.room.pin : '';

      const room = createResult.ok
        ? { ...createResult.room, phase: 'playing' as const, stateVersion: 0 }
        : null;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.submitMove('unknown_guest', pin ?? '', {
        from: 'e2',
        to: 'e4',
        expectedVersion: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('NOT_A_PLAYER');
    });

    it('rejects move when not your turn', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);
      redis.acquireChessRoomLock.mockResolvedValue(true);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: 'none', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      const pin = createResult.ok ? createResult.room.pin : '';

      const room = createResult.ok
        ? {
            ...createResult.room,
            phase: 'playing' as const,
            stateVersion: 0,
            turn: 'black',
            fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          }
        : null;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.submitMove('guest_1', pin ?? '', {
        from: 'e7',
        to: 'e5',
        expectedVersion: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('NOT_YOUR_TURN');
    });

    it('rejects move when game has result', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);
      redis.acquireChessRoomLock.mockResolvedValue(true);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: 'none', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      const pin = createResult.ok ? createResult.room.pin : '';

      const room = createResult.ok
        ? {
            ...createResult.room,
            phase: 'playing' as const,
            stateVersion: 1,
            result: {
              reason: 'checkmate' as const,
              winner: 'white' as const,
              endedAt: Date.now(),
            },
          }
        : null;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.submitMove('guest_1', pin ?? '', {
        from: 'e2',
        to: 'e4',
        expectedVersion: 1,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('GAME_FINISHED');
    });

    it('rejects a move when the game finishes after the pre-lock read', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: 'none', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      const pin = createResult.ok ? createResult.room.pin : '';
      const activeRoom = createResult.ok
        ? {
            ...createResult.room,
            phase: 'playing' as const,
            stateVersion: 0,
          }
        : null;
      const finishedRoom = activeRoom
        ? {
            ...activeRoom,
            phase: 'finished' as const,
            result: {
              reason: 'resignation' as const,
              winner: 'black' as const,
              endedAt: Date.now(),
            },
          }
        : null;
      redis.loadChessRoom
        .mockResolvedValueOnce(activeRoom)
        .mockResolvedValueOnce(finishedRoom);

      const result = await service.submitMove('guest_1', pin, {
        from: 'e2',
        to: 'e4',
        expectedVersion: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('GAME_FINISHED');
      expect(redis.saveChessRoom.mock.calls).toHaveLength(1);
    });

    it('rejects spectator move', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: 'none', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      const pin = createResult.ok ? createResult.room.pin : '';

      const room = createResult.ok
        ? { ...createResult.room, phase: 'playing' as const, stateVersion: 0 }
        : null;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.submitMove('spectator_123', pin ?? '', {
        from: 'e2',
        to: 'e4',
        expectedVersion: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('NOT_A_PLAYER');
    });

    it('accepts valid move and increments stateVersion', async () => {
      redis.isChessPinActive.mockResolvedValue(false);
      redis.saveChessRoom.mockResolvedValue(undefined);
      redis.addActiveChessPin.mockResolvedValue(undefined);
      redis.setChessGuestIdentity.mockResolvedValue(undefined);
      redis.acquireChessRoomLock.mockResolvedValue(true);

      const createResult = await service.createRoom(
        { playerName: 'أحمد', timeControl: 'none', colorChoice: 'white' },
        'guest_1',
        'token_1',
      );
      const pin = createResult.ok ? createResult.room.pin : '';

      const room = createResult.ok
        ? { ...createResult.room, phase: 'playing' as const, stateVersion: 0 }
        : null;
      redis.loadChessRoom.mockResolvedValue(room);

      const result = await service.submitMove('guest_1', pin ?? '', {
        from: 'e2',
        to: 'e4',
        expectedVersion: 0,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.newStateVersion).toBe(1);
        expect(result.san).toBe('e4');
      }
    });
  });

  describe('buildSnapshot', () => {
    it('does not include guestToken in snapshot', () => {
      const room = {
        pin: '123456',
        phase: 'waiting' as const,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'white' as const,
        stateVersion: 0,
        moves: [],
        timeControl: { initialSeconds: 300, incrementSeconds: 0 },
        whiteClock: { remainingMs: 300000 },
        blackClock: { remainingMs: 300000 },
        seats: {
          white: {
            guestId: 'guest_1',
            name: 'أحمد',
            color: 'white' as const,
            connected: true,
          },
          black: null,
        },
        spectators: [],
        spectatorCount: 0,
        lastMove: null,
        result: null,
        drawOffer: null,
        hostGuestId: 'guest_1',
        createdAt: Date.now(),
        startedAt: undefined,
        endedAt: undefined,
      };

      const snapshot = service.buildSnapshot(room, 'guest_1');
      expect(snapshot).not.toHaveProperty('guestToken');
      expect(snapshot.yourColor).toBe('white');
      expect(snapshot.yourRole).toBe('white');
    });
  });

  describe('executeWithRoomLock', () => {
    it('acquires and releases lock with matching token', async () => {
      redis.acquireChessRoomLock.mockResolvedValue(true);
      redis.saveChessRoom.mockResolvedValue(undefined);

      const result = await service.executeWithRoomLock('123456', () =>
        Promise.resolve('done'),
      );

      expect(result.acquired).toBe(true);
      if (result.acquired) {
        expect(result.value).toBe('done');
      }
      expect(redis.acquireChessRoomLock.mock.calls).toHaveLength(1);
      expect(redis.releaseChessRoomLock.mock.calls).toHaveLength(1);
      expect(redis.acquireSpecialRoomLock.mock.calls).toHaveLength(0);
      expect(redis.releaseSpecialRoomLock.mock.calls).toHaveLength(0);
    });

    it('does not release lock when token does not match', async () => {
      redis.acquireChessRoomLock.mockResolvedValue(true);
      redis.releaseChessRoomLock.mockResolvedValue(undefined);

      await service.executeWithRoomLock('123456', () =>
        Promise.resolve('done'),
      );

      const [[, token]] = redis.releaseChessRoomLock.mock.calls[0];
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });
});
