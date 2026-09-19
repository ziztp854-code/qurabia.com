import { createLiveAccessToken } from '@tahaddi/contracts';
import { GameGateway } from './game.gateway.js';

const secret = 'test-live-access-secret-value';

function createClient() {
  return {
    id: 'socket-1',
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    handshake: {
      address: '10.0.0.5',
      headers: {
        'x-forwarded-for': '203.0.113.44, 10.0.0.5',
        'user-agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36',
      },
    },
  };
}

describe('GameGateway', () => {
  const snapshot = {
    sessionId: 'session-1',
    roomCode: 'ABC123',
    phase: 'LOBBY' as const,
    serverTime: 1,
    question: null,
    reveal: null,
    leaderboard: [],
    participantCount: 1,
    playerAnswer: null,
    playerResult: null,
  };

  function setup() {
    const gameService = {
      setServer: jest.fn(),
      validateIdentity: jest.fn().mockResolvedValue(true),
      joined: jest.fn().mockResolvedValue(snapshot),
      disconnected: jest.fn(),
      startQuestion: jest.fn(),
      revealQuestion: jest.fn(),
      next: jest.fn(),
      submitAnswer: jest.fn(),
      finishGame: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue(secret) };
    return {
      gateway: new GameGateway(gameService as never, config as never),
      gameService,
    };
  }

  it('joins a valid player and returns a reconnect snapshot', async () => {
    const { gateway, gameService } = setup();
    const client = createClient();
    const token = createLiveAccessToken(secret, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });

    await gateway.handleGameJoin(client as never, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      accessToken: token,
      role: 'player',
      deviceId: '018f5e2a-7b66-7b2c-9a51-2397f59d67e1',
    });

    expect(gameService.validateIdentity).toHaveBeenCalled();
    expect(gameService.joined).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'player-1' }),
      {
        socketId: 'socket-1',
        ipAddress: '203.0.113.44',
        userAgent:
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36',
        deviceLabel: 'Chrome على Android (جوال)',
        deviceHash:
          '1dfb19f65447d3a15410c7cb318d10c937d51d12c013dec885e48e99f8decc50',
      },
    );
    expect(client.join).toHaveBeenCalledWith('live:session-1');
    expect(client.join).toHaveBeenCalledWith('live:session-1:player:player-1');
    expect(client.emit).toHaveBeenCalledWith('game:snapshot', snapshot);
  });

  it('records the socket identifier when a player disconnects', async () => {
    const { gateway, gameService } = setup();
    const client = createClient();
    const token = createLiveAccessToken(secret, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });

    await gateway.handleGameJoin(client as never, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      accessToken: token,
      role: 'player',
    });
    await gateway.handleDisconnect(client as never);

    expect(gameService.disconnected).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'player-1' }),
      'socket-1',
    );
  });

  it('rejects a forged join token', async () => {
    const { gateway, gameService } = setup();
    const client = createClient();
    await gateway.handleGameJoin(client as never, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      accessToken: 'forged',
      role: 'player',
    });
    expect(gameService.validateIdentity).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'game:error',
      expect.objectContaining({ code: 'JOIN_DENIED' }),
    );
  });

  it('prevents a player from starting a host-only question', async () => {
    const { gateway, gameService } = setup();
    const client = createClient();
    const token = createLiveAccessToken(secret, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });

    await gateway.handleGameJoin(client as never, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      accessToken: token,
      role: 'player',
    });
    client.emit.mockClear();

    await gateway.handleQuestionStart(client as never, {
      sessionId: 'session-1',
    });

    expect(gameService.startQuestion).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'game:error',
      expect.objectContaining({ code: 'HOST_ONLY' }),
    );
  });

  it('lets the authenticated host reveal the active question', async () => {
    const { gateway, gameService } = setup();
    const client = createClient();
    const token = createLiveAccessToken(secret, {
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });

    await gateway.handleGameJoin(client as never, {
      sessionId: 'session-1',
      subjectId: 'host-1',
      accessToken: token,
      role: 'host',
    });
    await gateway.handleQuestionReveal(client as never, {
      sessionId: 'session-1',
      questionId: 'question-1',
    });

    expect(gameService.revealQuestion).toHaveBeenCalledWith(
      'session-1',
      'question-1',
    );
  });

  it('uses clock ping/pong without a server-side countdown stream', () => {
    const { gateway } = setup();
    const client = createClient();
    const now = jest.spyOn(Date, 'now').mockReturnValue(456);
    gateway.handleClockPing(client as never, { clientSentAt: 123 });
    expect(client.emit).toHaveBeenCalledWith('clock:pong', {
      clientSentAt: 123,
      serverTime: 456,
    });
    now.mockRestore();
  });

  it('timestamps an answer as soon as it reaches the gateway', async () => {
    const { gateway, gameService } = setup();
    const client = createClient();
    const token = createLiveAccessToken(secret, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });
    await gateway.handleGameJoin(client as never, {
      sessionId: 'session-1',
      subjectId: 'player-1',
      accessToken: token,
      role: 'player',
    });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_234);

    await gateway.handleAnswerSubmit(client as never, {
      sessionId: 'session-1',
      questionId: 'question-1',
      optionId: 'option-1',
    });

    expect(gameService.submitAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'player-1' }),
      'socket-1',
      {
        questionId: 'question-1',
        optionId: 'option-1',
        receivedAt: 1_234,
      },
    );
    now.mockRestore();
  });
});
