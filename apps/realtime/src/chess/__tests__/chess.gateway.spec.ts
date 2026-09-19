import type { ChessRoom } from '@tahaddi/domain';
import type { Socket } from 'socket.io';
import type { RedisService } from '../../game/redis.service.js';
import {
  CHESS_TRANSPORT_DISCONNECT_DELAY_MS,
  ChessGateway,
} from '../chess.gateway.js';
import type { ChessService } from '../chess.service.js';
import type {
  ClientToServerChessEvents,
  ServerToClientChessEvents,
} from '../chess.types.js';

describe('ChessGateway', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const createGateway = (
    chess: jest.Mocked<ChessService>,
    consumeRateLimit = jest.fn().mockResolvedValue(null),
  ) =>
    new ChessGateway(chess, {
      consumeRateLimit,
      addChessSeatSocket: jest.fn().mockResolvedValue(undefined),
      removeChessSeatSocket: jest.fn().mockResolvedValue(0),
      getChessSeatSockets: jest.fn().mockResolvedValue([]),
    } as unknown as RedisService);

  it.each([
    {
      event: 'move',
      prepare: (gateway: ChessGateway) => {
        const internal = gateway as unknown as {
          socketRooms: Map<string, string>;
          socketGuestIds: Map<string, string>;
        };
        internal.socketRooms.set('socket-rotated', '123456');
        internal.socketGuestIds.set('socket-rotated', 'guest-rate-limited');
      },
      invoke: (gateway: ChessGateway, client: Socket) =>
        gateway.submitMove(client as never, {
          from: 'e2',
          to: 'e4',
          expectedVersion: 1,
        }),
      serviceMethod: 'submitMove',
    },
    {
      event: 'reconnect',
      prepare: () => undefined,
      invoke: (gateway: ChessGateway, client: Socket) =>
        gateway.reconnect(client as never, {
          pin: '123456',
          guestId: 'guest-rate-limited',
        }),
      serviceMethod: 'handleReconnect',
    },
  ])(
    'applies the local rate limit before chess $event work',
    async ({ prepare, invoke, serviceMethod }) => {
      const serviceCall = jest.fn();
      const chess = {
        validateGuest: jest
          .fn()
          .mockResolvedValue({ guestId: 'guest-rate-limited' }),
        [serviceMethod]: serviceCall,
      } as unknown as jest.Mocked<ChessService>;
      const gateway = createGateway(chess);
      const consume = jest.fn().mockReturnValue(false);
      (
        gateway as unknown as { rateLimiter: { consume: typeof consume } }
      ).rateLimiter = { consume };
      const emit = jest.fn();
      const client = {
        id: 'socket-rotated',
        handshake: {
          address: '203.0.113.10',
          auth: {
            guestId: 'guest-rate-limited',
            guestToken: 'guest-token',
          },
        },
        emit,
      } as unknown as Socket;
      prepare(gateway);

      await invoke(gateway, client);

      expect(serviceCall).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        'chess:error',
        expect.objectContaining({ code: 'RATE_LIMITED' }),
      );
    },
  );

  it('fails closed before a move when the configured distributed limiter denies it', async () => {
    const submitMove = jest.fn();
    const chess = { submitMove } as unknown as jest.Mocked<ChessService>;
    const consumeRateLimit = jest.fn().mockResolvedValue(false);
    const gateway = createGateway(chess, consumeRateLimit);
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-distributed', '123456');
    internal.socketGuestIds.set('socket-distributed', 'guest-distributed');
    const emit = jest.fn();
    const client = {
      id: 'socket-distributed',
      handshake: {
        address: '203.0.113.11',
        auth: { guestId: 'guest-distributed' },
      },
      emit,
    } as unknown as Socket;

    await gateway.submitMove(client as never, {
      from: 'e2',
      to: 'e4',
      expectedVersion: 1,
    });

    expect(consumeRateLimit).toHaveBeenCalled();
    expect(submitMove).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'chess:error',
      expect.objectContaining({ code: 'RATE_LIMITED' }),
    );
  });

  it.each([
    {
      event: 'create',
      invoke: (gateway: ChessGateway, client: Socket) =>
        gateway.createRoom(client as never, {
          playerName: 'أحمد',
          timeControl: '5+0',
          colorChoice: 'white',
        }),
      serviceMethod: 'createRoom',
    },
    {
      event: 'join',
      invoke: (gateway: ChessGateway, client: Socket) =>
        gateway.joinRoom(client as never, {
          pin: '123456',
          playerName: 'محمد',
        }),
      serviceMethod: 'joinRoom',
    },
    {
      event: 'spectate',
      invoke: (gateway: ChessGateway, client: Socket) =>
        gateway.spectate(client as never, {
          pin: '123456',
          spectatorName: 'سارة',
        }),
      serviceMethod: 'spectate',
    },
  ])(
    'rate limits chess room $event events',
    async ({ invoke, serviceMethod }) => {
      const serviceCall = jest.fn();
      const chess = {
        validateGuest: jest.fn().mockResolvedValue({ guestId: 'guest' }),
        [serviceMethod]: serviceCall,
      } as unknown as jest.Mocked<ChessService>;
      const gateway = createGateway(chess);
      const consume = jest.fn().mockReturnValue(false);
      (
        gateway as unknown as { rateLimiter: { consume: typeof consume } }
      ).rateLimiter = { consume };
      const emit = jest.fn();
      const client = {
        id: 'socket-1',
        handshake: {
          address: '203.0.113.10',
          auth: { guestId: 'guest', guestToken: 'token' },
        },
        emit,
      } as unknown as Socket;

      await invoke(gateway, client);

      expect(serviceCall).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        'chess:error',
        expect.objectContaining({ code: 'RATE_LIMITED' }),
      );
    },
  );

  it('rejects overlong player names before creating a room', async () => {
    const createRoom = jest.fn();
    const chess = {
      validateGuest: jest.fn().mockResolvedValue({ guestId: 'guest' }),
      createRoom,
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    const emit = jest.fn();
    const client = {
      id: 'socket-name',
      handshake: { auth: { guestId: 'guest', guestToken: 'token' } },
      emit,
    } as unknown as Socket;

    await gateway.createRoom(client as never, {
      playerName: 'ا'.repeat(31),
      timeControl: '5+0',
      colorChoice: 'white',
    });

    expect(createRoom).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'chess:error',
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
  });

  it('rejects malformed room pins before joining', async () => {
    const joinRoom = jest.fn();
    const chess = {
      validateGuest: jest.fn().mockResolvedValue({ guestId: 'guest' }),
      joinRoom,
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    const emit = jest.fn();
    const client = {
      id: 'socket-pin',
      handshake: { auth: { guestId: 'guest', guestToken: 'token' } },
      emit,
    } as unknown as Socket;

    await gateway.joinRoom(client as never, {
      pin: '1234567',
      playerName: 'محمد',
    });

    expect(joinRoom).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'chess:error',
      expect.objectContaining({ code: 'INVALID_JOIN' }),
    );
  });

  it('rejects unknown room settings before creating a room', async () => {
    const createRoom = jest.fn();
    const chess = {
      validateGuest: jest.fn(),
      createRoom,
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    const emit = jest.fn();
    const client = {
      handshake: { auth: { guestId: 'guest', guestToken: 'token' } },
      emit,
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.createRoom(client, {
      playerName: 'أحمد',
      timeControl: 'invalid',
      colorChoice: 'rainbow',
    });

    expect(emit).toHaveBeenCalledWith(
      'chess:error',
      expect.objectContaining({ code: 'INVALID_SETTINGS' }),
    );
    expect(createRoom).not.toHaveBeenCalled();
  });

  it('reports a room sync error when Redis cannot track the host socket', async () => {
    const room = {
      pin: '123456',
      seats: { white: { guestId: 'guest_host', color: 'white' }, black: null },
    } as unknown as ChessRoom;
    const chess = {
      validateGuest: jest.fn().mockResolvedValue({ guestId: 'guest_host' }),
      createRoom: jest.fn().mockResolvedValue({ ok: true, room }),
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    const addChessSeatSocket = jest
      .fn()
      .mockRejectedValue(new Error('Redis unavailable'));
    (
      gateway as unknown as {
        redis: { addChessSeatSocket: typeof addChessSeatSocket };
      }
    ).redis.addChessSeatSocket = addChessSeatSocket;
    const leave = jest.fn().mockResolvedValue(undefined);
    const emit = jest.fn();
    const client = {
      id: 'socket-host',
      handshake: { auth: { guestId: 'guest_host', guestToken: 'token_host' } },
      join: jest.fn().mockResolvedValue(undefined),
      leave,
      emit,
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.createRoom(client, {
      playerName: 'أحمد',
      timeControl: '5+0',
      colorChoice: 'white',
    });

    expect(addChessSeatSocket).toHaveBeenCalledWith(
      room.pin,
      'guest_host',
      'socket-host',
    );
    expect(leave).toHaveBeenCalledWith(room.pin);
    expect(emit).toHaveBeenCalledWith('chess:error', {
      code: 'ROOM_SYNC_FAILED',
      message: 'تعذّر تجهيز اتصال الغرفة. حاول مرة أخرى.',
    });
  });

  it('joins with the authenticated guest identity', async () => {
    const room = {
      pin: '123456',
      hostGuestId: 'guest_host',
      seats: {
        white: { guestId: 'guest_host', color: 'white' },
        black: { guestId: 'guest_join', color: 'black' },
      },
    } as unknown as ChessRoom;
    const joinRoom = jest.fn().mockResolvedValue({ ok: true, room });
    const buildSnapshot = jest.fn().mockReturnValue({ pin: room.pin });
    const chess = {
      validateGuest: jest.fn().mockResolvedValue({ guestId: 'guest_join' }),
      joinRoom,
      findSeat: jest.fn().mockReturnValue(room.seats.black),
      buildSnapshot,
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as typeof gateway.server;
    const client = {
      id: 'socket-join',
      handshake: {
        auth: { guestId: 'guest_join', guestToken: 'token_join' },
      },
      join: jest.fn(),
      emit: jest.fn(),
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.joinRoom(client, { pin: room.pin, playerName: 'محمد' });

    expect(joinRoom).toHaveBeenCalledWith(
      { pin: room.pin, playerName: 'محمد' },
      'guest_join',
      'token_join',
    );
    expect(buildSnapshot).toHaveBeenCalledWith(room, 'guest_join');
  });

  it('reports a room sync error when Redis cannot track the joined socket', async () => {
    const room = {
      pin: '123456',
      hostGuestId: 'guest_host',
      seats: {
        white: { guestId: 'guest_host', color: 'white' },
        black: { guestId: 'guest_join', color: 'black' },
      },
    } as unknown as ChessRoom;
    const chess = {
      validateGuest: jest.fn().mockResolvedValue({ guestId: 'guest_join' }),
      joinRoom: jest.fn().mockResolvedValue({ ok: true, room }),
      findSeat: jest.fn().mockReturnValue(room.seats.black),
      buildSnapshot: jest.fn(),
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    const addChessSeatSocket = jest
      .fn()
      .mockRejectedValue(new Error('Redis unavailable'));
    (
      gateway as unknown as {
        redis: { addChessSeatSocket: typeof addChessSeatSocket };
      }
    ).redis.addChessSeatSocket = addChessSeatSocket;
    const emit = jest.fn();
    const client = {
      id: 'socket-join',
      handshake: { auth: { guestId: 'guest_join', guestToken: 'token_join' } },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit,
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.joinRoom(client, { pin: room.pin, playerName: 'محمد' });

    expect(emit).toHaveBeenCalledWith('chess:error', {
      code: 'ROOM_SYNC_FAILED',
      message: 'تعذّر تجهيز اتصال الغرفة. حاول مرة أخرى.',
    });
    expect(chess.buildSnapshot.mock.calls).toHaveLength(0);
  });

  it('ignores a spoofed reconnect guestId and notifies the opponent', async () => {
    const room = {
      pin: '123456',
      phase: 'playing',
      timeControl: { initialSeconds: 0, incrementSeconds: 0 },
      seats: {
        white: { guestId: 'guest_real', color: 'white' },
        black: { guestId: 'guest_other', color: 'black' },
      },
    } as unknown as ChessRoom;
    const validateGuest = jest
      .fn()
      .mockResolvedValue({ guestId: 'guest_real' });
    const handleReconnect = jest.fn().mockResolvedValue({ ok: true, room });
    const chess = {
      validateGuest,
      handleReconnect,
      findSeat: jest.fn().mockReturnValue(room.seats.white),
      buildSnapshot: jest.fn().mockReturnValue({ pin: room.pin }),
    } as unknown as jest.Mocked<ChessService>;
    const opponentEmit = jest.fn();
    const gateway = createGateway(chess);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as typeof gateway.server;
    const client = {
      id: 'socket-real',
      handshake: {
        auth: { guestId: 'guest_real', guestToken: 'token_real' },
      },
      join: jest.fn(),
      to: jest.fn(() => ({ emit: opponentEmit })),
      emit: jest.fn(),
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.reconnect(client, {
      pin: room.pin,
      guestId: 'guest_spoofed',
    });

    expect(validateGuest).toHaveBeenCalledWith('guest_real', 'token_real');
    expect(handleReconnect).toHaveBeenCalledWith('guest_real', room.pin);
    expect(opponentEmit).toHaveBeenCalledWith('chess:opponent:reconnect');
  });

  it('keeps a stable spectator identity across socket reconnects', async () => {
    const room = {
      pin: '123456',
      seats: { white: null, black: null },
      spectators: [],
    } as unknown as ChessRoom;
    const spectate = jest.fn().mockResolvedValue({ ok: true, room });
    const chess = {
      spectate,
      buildSnapshot: jest.fn().mockReturnValue({ pin: room.pin }),
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as typeof gateway.server;

    for (const socketId of ['socket-before-drop', 'socket-after-drop']) {
      const client = {
        id: socketId,
        handshake: { auth: { guestId: 'guest_stable' } },
        join: jest.fn().mockResolvedValue(undefined),
        emit: jest.fn(),
      } as unknown as Socket<
        ClientToServerChessEvents,
        ServerToClientChessEvents
      >;

      await gateway.spectate(client, {
        pin: room.pin,
        spectatorName: 'سارة',
      });
    }

    expect(spectate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ spectatorId: 'spectator_guest_stable' }),
    );
    expect(spectate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ spectatorId: 'spectator_guest_stable' }),
    );
  });

  it('sends every viewer a snapshot built for their own identity after a move', async () => {
    const room = {
      pin: '123456',
      seats: {
        white: { guestId: 'guest_white', color: 'white' },
        black: { guestId: 'guest_black', color: 'black' },
      },
    } as unknown as ChessRoom;
    const chess = {
      submitMove: jest.fn().mockResolvedValue({
        ok: true,
        san: 'e4',
        newFen: 'after-e4',
        newStateVersion: 2,
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        isDraw: false,
      }),
      getRoom: jest.fn().mockResolvedValue(room),
      findSeat: jest.fn((_: ChessRoom, guestId: string) =>
        guestId === 'guest_white' ? room.seats.white : room.seats.black,
      ),
      buildSnapshot: jest.fn((_: ChessRoom, guestId?: string) => ({
        pin: room.pin,
        yourColor:
          guestId === 'guest_white'
            ? 'white'
            : guestId === 'guest_black'
              ? 'black'
              : null,
      })),
    } as unknown as jest.Mocked<ChessService>;
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const gateway = createGateway(chess);
    gateway.server = { to } as unknown as typeof gateway.server;
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-white', room.pin);
    internal.socketRooms.set('socket-black', room.pin);
    internal.socketRooms.set('socket-spectator', room.pin);
    internal.socketGuestIds.set('socket-white', 'guest_white');
    internal.socketGuestIds.set('socket-black', 'guest_black');
    const client = {
      id: 'socket-white',
      handshake: { auth: { guestId: 'guest_white' } },
      emit: jest.fn(),
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.submitMove(client, {
      from: 'e2',
      to: 'e4',
      expectedVersion: 1,
    });

    expect(to).toHaveBeenCalledWith('socket-white');
    expect(to).toHaveBeenCalledWith('socket-black');
    expect(to).toHaveBeenCalledWith('socket-spectator');
    expect(emit).toHaveBeenCalledWith(
      'chess:room:state',
      expect.objectContaining({ yourColor: 'white' }),
    );
    expect(emit).toHaveBeenCalledWith(
      'chess:room:state',
      expect.objectContaining({ yourColor: 'black' }),
    );
    expect(emit).toHaveBeenCalledWith(
      'chess:room:state',
      expect.objectContaining({ yourColor: null }),
    );
    expect(to).not.toHaveBeenCalledWith(room.pin);
  });

  it('uses the move room pin when a reconnected socket lost its local room binding', async () => {
    const room = {
      pin: '123456',
      seats: {
        white: { guestId: 'guest_white', color: 'white' },
        black: { guestId: 'guest_black', color: 'black' },
      },
      moves: [],
    } as unknown as ChessRoom;
    const handleReconnect = jest.fn().mockResolvedValue({ ok: true, room });
    const chess = {
      validateGuest: jest
        .fn()
        .mockResolvedValue({ guestId: 'guest_white', pin: room.pin }),
      handleReconnect,
      submitMove: jest.fn().mockResolvedValue({
        ok: true,
        san: 'e4',
        newFen: 'after-e4',
        newStateVersion: 2,
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        isDraw: false,
      }),
      getRoom: jest.fn().mockResolvedValue(room),
      findSeat: jest.fn().mockReturnValue(room.seats.white),
      buildSnapshot: jest.fn().mockReturnValue({ pin: room.pin }),
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as typeof gateway.server;
    const client = {
      id: 'socket-after-reconnect',
      handshake: {
        address: '203.0.113.20',
        auth: { guestId: 'guest_white', guestToken: 'guest-token' },
      },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.submitMove(client, {
      pin: room.pin,
      from: 'e2',
      to: 'e4',
      expectedVersion: 1,
    });

    expect(handleReconnect).toHaveBeenCalledWith('guest_white', room.pin);
    expect(chess.submitMove.mock.calls).toContainEqual([
      'guest_white',
      room.pin,
      expect.objectContaining({ from: 'e2', to: 'e4', expectedVersion: 1 }),
    ]);
  });

  it.each([
    {
      caseName: 'invalid guest token',
      identity: null,
      reconnectResult: { ok: true },
    },
    {
      caseName: 'guest identity bound to another room',
      identity: { guestId: 'guest_white', pin: '654321' },
      reconnectResult: { ok: true },
    },
    {
      caseName: 'guest without a seat',
      identity: { guestId: 'guest_white', pin: '123456' },
      reconnectResult: {
        ok: false,
        code: 'NOT_IN_ROOM',
        message: 'لست في هذه الغرفة.',
      },
    },
  ])(
    'rejects move pin recovery for $caseName',
    async ({ identity, reconnectResult }) => {
      const room = {
        pin: '123456',
        seats: {
          white: { guestId: 'guest_white', color: 'white' },
          black: null,
        },
        moves: [],
      } as unknown as ChessRoom;
      const chess = {
        validateGuest: jest.fn().mockResolvedValue(identity),
        handleReconnect: jest.fn().mockResolvedValue(reconnectResult),
        submitMove: jest.fn(),
      } as unknown as jest.Mocked<ChessService>;
      const gateway = createGateway(chess);
      const emit = jest.fn();
      const client = {
        id: 'socket-without-binding',
        handshake: {
          address: '203.0.113.21',
          auth: { guestId: 'guest_white', guestToken: 'guest-token' },
        },
        join: jest.fn().mockResolvedValue(undefined),
        emit,
      } as unknown as Socket<
        ClientToServerChessEvents,
        ServerToClientChessEvents
      >;

      await gateway.submitMove(client, {
        pin: room.pin,
        from: 'e2',
        to: 'e4',
        expectedVersion: 1,
      });

      expect(chess.submitMove.mock.calls).toHaveLength(0);
      expect(emit).toHaveBeenCalledWith('chess:error', {
        code: 'INVALID_SESSION',
        message: 'جلسة غير صالحة.',
      });
    },
  );

  it('rejects a malformed room pin before move recovery lookup', async () => {
    const chess = {
      validateGuest: jest.fn(),
      handleReconnect: jest.fn(),
      submitMove: jest.fn(),
    } as unknown as jest.Mocked<ChessService>;
    const gateway = createGateway(chess);
    const emit = jest.fn();
    const client = {
      id: 'socket-with-malformed-pin',
      handshake: {
        address: '203.0.113.22',
        auth: { guestId: 'guest_white', guestToken: 'guest-token' },
      },
      emit,
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.submitMove(client, {
      pin: '../room',
      from: 'e2',
      to: 'e4',
      expectedVersion: 1,
    });

    expect(chess.validateGuest.mock.calls).toHaveLength(0);
    expect(chess.handleReconnect.mock.calls).toHaveLength(0);
    expect(chess.submitMove.mock.calls).toHaveLength(0);
    expect(emit).toHaveBeenCalledWith('chess:error', {
      code: 'INVALID_SESSION',
      message: 'جلسة غير صالحة.',
    });
  });

  it('broadcasts a terminal snapshot when a move discovers timeout', async () => {
    const room = {
      pin: '123456',
      startedAt: 1_000,
      endedAt: 2_000,
      moves: [],
      result: { reason: 'timeout', winner: 'black', endedAt: 2_000 },
      seats: { white: { guestId: 'guest_white', color: 'white' }, black: null },
    } as unknown as ChessRoom;
    const chess = {
      submitMove: jest.fn().mockResolvedValue({
        ok: false,
        code: 'GAME_FINISHED',
        message: 'انتهى الوقت.',
      }),
      getRoom: jest.fn().mockResolvedValue(room),
      findSeat: jest.fn().mockReturnValue(room.seats.white),
      buildSnapshot: jest
        .fn()
        .mockReturnValue({ pin: room.pin, result: room.result }),
    } as unknown as jest.Mocked<ChessService>;
    const emit = jest.fn();
    const gateway = createGateway(chess);
    gateway.server = {
      to: jest.fn(() => ({ emit })),
    } as unknown as typeof gateway.server;
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-white', room.pin);
    internal.socketGuestIds.set('socket-white', 'guest_white');
    const client = {
      id: 'socket-white',
      handshake: { auth: { guestId: 'guest_white' } },
      emit: jest.fn(),
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.submitMove(client, {
      from: 'e2',
      to: 'e4',
      expectedVersion: 0,
    });

    expect(emit).toHaveBeenCalledWith(
      'chess:game:end',
      expect.objectContaining({ reason: 'timeout', winner: 'black' }),
    );
  });

  it('does not mark a player disconnected while another socket for the same seat remains across instances', async () => {
    const room = {
      pin: '123456',
      seats: {
        white: { guestId: 'guest_white', color: 'white' },
        black: { guestId: 'guest_black', color: 'black' },
      },
    } as unknown as ChessRoom;
    const removeChessSeatSocket = jest.fn().mockResolvedValue(1);
    const handleDisconnect = jest.fn();
    const chess = {
      getRoom: jest.fn().mockResolvedValue(room),
      findSeat: jest.fn().mockReturnValue(room.seats.white),
      handleDisconnect,
    } as unknown as jest.Mocked<ChessService>;
    const emit = jest.fn();
    const gateway = createGateway(chess, jest.fn().mockResolvedValue(null));
    (
      gateway as unknown as {
        redis: { removeChessSeatSocket: typeof removeChessSeatSocket };
      }
    ).redis.removeChessSeatSocket = removeChessSeatSocket;
    gateway.server = {
      to: jest.fn(() => ({ emit })),
    } as unknown as typeof gateway.server;
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-old', room.pin);
    internal.socketRooms.set('socket-current', room.pin);
    internal.socketGuestIds.set('socket-old', 'guest_white');
    internal.socketGuestIds.set('socket-current', 'guest_white');
    const client = {
      id: 'socket-old',
      handshake: { auth: { guestId: 'guest_white' } },
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.handleDisconnect(client);

    expect(handleDisconnect).not.toHaveBeenCalled();
    expect(removeChessSeatSocket).toHaveBeenCalledWith(
      room.pin,
      'guest_white',
      'socket-old',
    );
    expect(emit).not.toHaveBeenCalledWith(
      'chess:opponent:disconnect',
      expect.anything(),
    );
    expect(internal.socketRooms.has('socket-old')).toBe(false);
    expect(internal.socketGuestIds.has('socket-old')).toBe(false);
    expect(internal.socketRooms.get('socket-current')).toBe(room.pin);
  });

  it('does not broadcast an opponent disconnect for a socket that is not a player seat', async () => {
    const room = {
      pin: '123456',
      seats: {
        white: { guestId: 'guest_white', color: 'white' },
        black: { guestId: 'guest_black', color: 'black' },
      },
    } as unknown as ChessRoom;
    const handleDisconnect = jest.fn();
    const chess = {
      getRoom: jest.fn().mockResolvedValue(room),
      findSeat: jest.fn().mockReturnValue(null),
      handleDisconnect,
    } as unknown as jest.Mocked<ChessService>;
    const emit = jest.fn();
    const gateway = createGateway(chess);
    gateway.server = {
      to: jest.fn(() => ({ emit })),
    } as unknown as typeof gateway.server;
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-viewer', room.pin);
    internal.socketGuestIds.set('socket-viewer', 'spectator_socket-viewer');
    const client = {
      id: 'socket-viewer',
      handshake: { auth: { guestId: 'spectator_socket-viewer' } },
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.handleDisconnect(client);

    expect(handleDisconnect).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalledWith(
      'chess:opponent:disconnect',
      expect.anything(),
    );
    expect(internal.socketRooms.has('socket-viewer')).toBe(false);
    expect(internal.socketGuestIds.has('socket-viewer')).toBe(false);
  });

  it('delays marking a seat disconnected after the last transport socket drops', async () => {
    jest.useFakeTimers();
    const room = {
      pin: '123456',
      seats: {
        white: { guestId: 'guest_white', color: 'white' },
        black: { guestId: 'guest_black', color: 'black' },
      },
    } as unknown as ChessRoom;
    const handleDisconnect = jest.fn().mockResolvedValue(undefined);
    const chess = {
      getRoom: jest.fn().mockResolvedValue(room),
      findSeat: jest.fn().mockReturnValue(room.seats.white),
      handleDisconnect,
    } as unknown as jest.Mocked<ChessService>;
    const emit = jest.fn();
    const gateway = createGateway(chess);
    const getChessSeatSockets = jest.fn().mockResolvedValue([]);
    (
      gateway as unknown as {
        redis: {
          getChessSeatSockets: typeof getChessSeatSockets;
          removeChessSeatSocket: jest.Mock;
        };
      }
    ).redis.getChessSeatSockets = getChessSeatSockets;
    (
      gateway as unknown as {
        redis: { removeChessSeatSocket: jest.Mock };
      }
    ).redis.removeChessSeatSocket = jest.fn().mockResolvedValue(0);
    gateway.server = {
      to: jest.fn(() => ({ emit })),
    } as unknown as typeof gateway.server;
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-white', room.pin);
    internal.socketGuestIds.set('socket-white', 'guest_white');
    const client = {
      id: 'socket-white',
      handshake: { auth: { guestId: 'guest_white' } },
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.handleDisconnect(client);

    expect(handleDisconnect).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(
      CHESS_TRANSPORT_DISCONNECT_DELAY_MS - 1,
    );
    expect(handleDisconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    expect(handleDisconnect).toHaveBeenCalledWith('guest_white', room.pin);
    expect(emit).toHaveBeenCalledWith('chess:opponent:disconnect', {
      gracePeriodSeconds: 60,
    });
  });

  it('cancels a pending transport disconnect when the player reconnects', async () => {
    jest.useFakeTimers();
    const room = {
      pin: '123456',
      phase: 'waiting',
      seats: {
        white: { guestId: 'guest_white', color: 'white' },
        black: { guestId: 'guest_black', color: 'black' },
      },
    } as unknown as ChessRoom;
    const handleDisconnect = jest.fn().mockResolvedValue(undefined);
    const chess = {
      getRoom: jest.fn().mockResolvedValue(room),
      findSeat: jest.fn().mockReturnValue(room.seats.white),
      handleDisconnect,
      validateGuest: jest.fn().mockResolvedValue({ guestId: 'guest_white' }),
      handleReconnect: jest.fn().mockResolvedValue({ ok: true, room }),
      buildSnapshot: jest.fn().mockReturnValue({ pin: room.pin }),
    } as unknown as jest.Mocked<ChessService>;
    const emit = jest.fn();
    const gateway = createGateway(chess);
    gateway.server = {
      to: jest.fn(() => ({ emit })),
    } as unknown as typeof gateway.server;
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-old', room.pin);
    internal.socketGuestIds.set('socket-old', 'guest_white');
    const droppedClient = {
      id: 'socket-old',
      handshake: { auth: { guestId: 'guest_white' } },
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.handleDisconnect(droppedClient);

    const newClient = {
      id: 'socket-new',
      handshake: {
        auth: { guestId: 'guest_white', guestToken: 'token_white' },
      },
      join: jest.fn().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: jest.fn() })),
      emit: jest.fn(),
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.reconnect(newClient, {
      pin: room.pin,
      guestId: 'guest_white',
    });

    await jest.advanceTimersByTimeAsync(CHESS_TRANSPORT_DISCONNECT_DELAY_MS);

    expect(handleDisconnect).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalledWith(
      'chess:opponent:disconnect',
      expect.anything(),
    );
  });

  it('broadcasts a temporary disconnect when a player leaves an active game', async () => {
    const room = {
      pin: '123456',
      phase: 'playing' as const,
      result: null,
      seats: {
        white: { guestId: 'guest_white', color: 'white' },
        black: { guestId: 'guest_black', color: 'black' },
      },
    } as unknown as ChessRoom;
    const leaveRoom = jest.fn().mockResolvedValue({ ok: true, room });
    const chess = {
      leaveRoom,
      buildSnapshot: jest.fn().mockReturnValue({ pin: room.pin }),
    } as unknown as jest.Mocked<ChessService>;
    const emit = jest.fn();
    const gateway = createGateway(chess);
    const removeChessSeatSocket = jest.fn().mockResolvedValue(0);
    (
      gateway as unknown as {
        redis: { removeChessSeatSocket: typeof removeChessSeatSocket };
      }
    ).redis.removeChessSeatSocket = removeChessSeatSocket;
    gateway.server = {
      to: jest.fn(() => ({ emit })),
    } as unknown as typeof gateway.server;
    const internal = gateway as unknown as {
      socketRooms: Map<string, string>;
      socketGuestIds: Map<string, string>;
    };
    internal.socketRooms.set('socket-white', room.pin);
    internal.socketGuestIds.set('socket-white', 'guest_white');
    const leave = jest.fn().mockResolvedValue(undefined);
    const client = {
      id: 'socket-white',
      handshake: { auth: { guestId: 'guest_white' } },
      leave,
    } as unknown as Socket<
      ClientToServerChessEvents,
      ServerToClientChessEvents
    >;

    await gateway.leaveRoom(client, { pin: room.pin });

    expect(leaveRoom).toHaveBeenCalledWith('guest_white', room.pin);
    expect(leave).toHaveBeenCalledWith(room.pin);
    expect(removeChessSeatSocket).toHaveBeenCalledWith(
      room.pin,
      'guest_white',
      'socket-white',
    );
    expect(emit).toHaveBeenCalledWith('chess:opponent:disconnect', {
      gracePeriodSeconds: 60,
    });
    expect(internal.socketRooms.has('socket-white')).toBe(false);
    expect(internal.socketGuestIds.has('socket-white')).toBe(false);
  });
});
