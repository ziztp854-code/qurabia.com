import { ConfigService } from '@nestjs/config';
import { createLadderHostAccessToken } from '@tahaddi/contracts';
import { LadderGateway } from '../ladder.gateway.js';
import type { LadderService } from '../ladder.service.js';
import type { RedisService } from '../../game/redis.service.js';

const AUTH_SECRET = 'x'.repeat(32);

const createClient = (auth: Record<string, string> = {}) => ({
  id: 'socket-host',
  handshake: { auth, address: '127.0.0.1' },
  emit: jest.fn(),
  join: jest.fn().mockResolvedValue(undefined),
  leave: jest.fn().mockResolvedValue(undefined),
});

describe('LadderGateway host access', () => {
  const room = {
    roomCode: 'AB12CD34',
    hostId: 'user-host',
    status: 'waiting',
    currentRound: 0,
    totalRounds: 10,
    rightScore: 0,
    leftScore: 0,
    rightPosition: 0,
    leftPosition: 0,
    winningPosition: 10,
    questionTimeLimit: 30,
    currentQuestion: null,
    teams: [],
    createdAt: 0,
    updatedAt: 0,
  } as const;

  const ladder = {
    createRoom: jest.fn().mockResolvedValue({ ok: true, room }),
    startGame: jest.fn().mockResolvedValue({ ok: true, room }),
    buildSnapshot: jest.fn().mockReturnValue({ roomCode: room.roomCode }),
    submitAnswer: jest.fn(),
    leaveRoom: jest.fn(),
    validateGuest: jest.fn(),
    joinRoom: jest.fn(),
    handleReconnect: jest.fn(),
  };
  const redis = {
    consumeRateLimit: jest.fn().mockResolvedValue(true),
  };
  const config = {
    get: jest.fn().mockReturnValue(AUTH_SECRET),
  };

  const createGateway = () => {
    const gateway = new LadderGateway(
      ladder as unknown as LadderService,
      redis as unknown as RedisService,
      config as unknown as ConfigService,
    );
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as never;
    return gateway;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    redis.consumeRateLimit.mockResolvedValue(true);
    ladder.createRoom.mockResolvedValue({ ok: true, room });
    ladder.startGame.mockResolvedValue({ ok: true, room });
  });

  it('rejects room creation from an unauthenticated guest socket', async () => {
    const gateway = createGateway();
    const client = createClient({
      guestId: 'guest-1',
      guestToken: 'guest-token',
    });

    await gateway.hostRoom(client as never, {
      totalRounds: 10,
      winningPosition: 10,
      questionTimeLimit: 30,
    });

    expect(ladder.createRoom).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('ladder:error', {
      code: 'HOST_AUTH_REQUIRED',
      message: 'سجّل دخولك من بوابة المضيف لإنشاء غرفة السلم.',
    });
  });

  it('creates a room for the signed account identity without adding the host as a player', async () => {
    const gateway = createGateway();
    const hostAccessToken = createLadderHostAccessToken(AUTH_SECRET, {
      hostId: 'user-host',
      expiresAt: Date.now() + 60_000,
    });
    const client = createClient({ hostId: 'user-host', hostAccessToken });

    await gateway.hostRoom(client as never, {
      totalRounds: 10,
      winningPosition: 10,
      questionTimeLimit: 30,
    });

    expect(ladder.createRoom).toHaveBeenCalledWith(
      {
        totalRounds: 10,
        winningPosition: 10,
        questionTimeLimit: 30,
      },
      'user-host',
    );
  });

  it('rejects start from a player socket even when the room code is known', async () => {
    const gateway = createGateway();
    const client = createClient({
      guestId: 'guest-1',
      guestToken: 'guest-token',
    });

    await gateway.startGame(client as never, { roomCode: room.roomCode });

    expect(ladder.startGame).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('ladder:error', {
      code: 'NOT_HOST',
      message: 'المضيف الموثّق وحده يستطيع بدء اللعبة.',
    });
  });

  it('rejects an answer from an unattached socket claiming another guest identity', async () => {
    const gateway = createGateway();
    const client = createClient({ guestId: 'guest-1', guestToken: 'forged' });
    await gateway.submitAnswer(client as never, {
      roomCode: room.roomCode,
      questionId: 'q1',
      optionId: 'a',
    });
    expect(ladder.submitAnswer).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'ladder:error',
      expect.objectContaining({ code: 'INVALID_SESSION' }),
    );
  });

  it.each(['join', 'reconnect'] as const)(
    'accepts answers after an authenticated %s',
    async (method) => {
      const gateway = createGateway();
      const client = createClient({ guestId: 'guest-1', guestToken: 'valid' });
      ladder.validateGuest.mockResolvedValue({
        guestId: 'guest-1',
        roomCode: room.roomCode,
      });
      ladder.joinRoom.mockResolvedValue({ ok: true, room });
      ladder.handleReconnect.mockResolvedValue({ ok: true, room });
      ladder.submitAnswer.mockResolvedValue({ ok: true, room });
      if (method === 'join') {
        await gateway.joinRoom(client as never, {
          roomCode: room.roomCode,
          playerName: 'لاعب',
          team: 'right',
        });
      } else {
        await gateway.reconnect(client as never, { roomCode: room.roomCode });
      }
      await gateway.submitAnswer(client as never, {
        roomCode: room.roomCode,
        questionId: 'q1',
        optionId: 'a',
      });
      expect(ladder.submitAnswer).toHaveBeenCalledWith(
        'guest-1',
        room.roomCode,
        'q1',
        'a',
      );
    },
  );

  it('rejects reconnect with a valid identity bound to another room', async () => {
    const gateway = createGateway();
    const client = createClient({ guestId: 'guest-1', guestToken: 'valid' });
    ladder.validateGuest.mockResolvedValue({
      guestId: 'guest-1',
      roomCode: 'ZZ11ZZ11',
    });
    await gateway.reconnect(client as never, { roomCode: room.roomCode });
    expect(ladder.handleReconnect).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'ladder:error',
      expect.objectContaining({ code: 'INVALID_GUEST' }),
    );
  });

  it('declares the team higher on the ladder the winner when rounds end', async () => {
    const gateway = createGateway();
    const emit = jest.fn();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;
    const hostAccessToken = createLadderHostAccessToken(AUTH_SECRET, {
      hostId: 'user-host',
      expiresAt: Date.now() + 60_000,
    });
    const client = createClient({ hostId: 'user-host', hostAccessToken });
    ladder.startGame.mockResolvedValue({
      ok: true,
      room: { ...room, status: 'finished', rightPosition: 4, leftPosition: 3 },
    });
    await gateway.startGame(client as never, { roomCode: room.roomCode });
    expect(emit).toHaveBeenCalledWith(
      'ladder:game:end',
      expect.objectContaining({ winner: 'right' }),
    );
  });

  it('rejects a signed token when the claimed host identity does not match', async () => {
    const gateway = createGateway();
    const hostAccessToken = createLadderHostAccessToken(AUTH_SECRET, {
      hostId: 'user-host',
      expiresAt: Date.now() + 60_000,
    });
    const client = createClient({ hostId: 'different-user', hostAccessToken });

    await gateway.hostRoom(client as never, {
      totalRounds: 10,
      winningPosition: 10,
      questionTimeLimit: 30,
    });

    expect(ladder.createRoom).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('ladder:error', {
      code: 'HOST_AUTH_REQUIRED',
      message: 'سجّل دخولك من بوابة المضيف لإنشاء غرفة السلم.',
    });
  });
});
