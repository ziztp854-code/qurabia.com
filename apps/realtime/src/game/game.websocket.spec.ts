import { createServer, type Server as HttpServer } from 'node:http';
import {
  createLiveAccessToken,
  type ClientToServerEvents,
  type QuestionPayload,
  type ServerToClientEvents,
} from '@tahaddi/contracts';
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import { Server } from 'socket.io';
import { GameGateway } from './game.gateway.js';
import { gameRoom } from './game.service.js';

type BrowserSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const secret = 'test-websocket-access-secret';

describe('host and player websocket flow', () => {
  let httpServer: HttpServer;
  let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;
  const clients: BrowserSocket[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await new Promise<void>((resolve) => {
      void ioServer.close(() => resolve());
    });
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('delivers one server-authored question and acknowledges the player answer', async () => {
    httpServer = createServer();
    ioServer = new Server<ClientToServerEvents, ServerToClientEvents>(
      httpServer,
    );
    const question: QuestionPayload = {
      questionId: 'question-1',
      prompt: 'سؤال متزامن',
      options: [
        { id: 'a', text: 'الأول', position: 0 },
        { id: 'b', text: 'الثاني', position: 1 },
      ],
      media: [],
      questionStartedAt: Date.now() + 100,
      questionEndsAt: Date.now() + 20_100,
      questionNumber: 1,
      totalQuestions: 1,
    };
    const gameService = {
      setServer: jest.fn(),
      validateIdentity: jest.fn().mockResolvedValue(true),
      joined: jest.fn(
        (identity: { sessionId: string; role: 'host' | 'player' }) =>
          Promise.resolve({
            sessionId: identity.sessionId,
            roomCode: 'ABC123',
            phase: 'LOBBY' as const,
            serverTime: Date.now(),
            question: null,
            reveal: null,
            leaderboard: [],
            participantCount: 1,
            playerAnswer: null,
            playerResult: null,
          }),
      ),
      disconnected: jest.fn(),
      startQuestion: jest.fn((sessionId: string) => {
        ioServer.to(gameRoom(sessionId)).emit('question:started', question);
        return Promise.resolve(true);
      }),
      next: jest.fn(),
      submitAnswer: jest.fn(
        (
          _identity: unknown,
          socketId: string,
          input: { questionId: string },
        ) => {
          ioServer.to(socketId).emit('answer:accepted', {
            questionId: input.questionId,
            receivedAt: Date.now(),
          });
          return Promise.resolve(true);
        },
      ),
      finishGame: jest.fn(),
    };
    const gateway = new GameGateway(
      gameService as never,
      { get: jest.fn().mockReturnValue(secret) } as never,
    );
    gateway.server = ioServer;
    gateway.afterInit(ioServer);
    ioServer.on('connection', (socket) => {
      socket.on(
        'game:join',
        (payload) => void gateway.handleGameJoin(socket, payload),
      );
      socket.on(
        'question:start',
        (payload) => void gateway.handleQuestionStart(socket, payload),
      );
      socket.on(
        'answer:submit',
        (payload) => void gateway.handleAnswerSubmit(socket, payload),
      );
      socket.on('disconnect', () => void gateway.handleDisconnect(socket));
    });

    await new Promise<void>((resolve) =>
      httpServer.listen(0, '127.0.0.1', resolve),
    );
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not start.');
    const url = `http://127.0.0.1:${address.port}`;
    const host = createClient(url, {
      transports: ['websocket'],
      forceNew: true,
    });
    const player = createClient(url, {
      transports: ['websocket'],
      forceNew: true,
    });
    clients.push(host, player);
    await Promise.all([waitFor(host, 'connect'), waitFor(player, 'connect')]);

    const hostSnapshot = waitFor(host, 'game:snapshot');
    host.emit('game:join', {
      sessionId: 'session-1',
      subjectId: 'host-1',
      accessToken: createLiveAccessToken(secret, {
        sessionId: 'session-1',
        subjectId: 'host-1',
        role: 'host',
      }),
      role: 'host',
    });
    const playerSnapshot = waitFor(player, 'game:snapshot');
    player.emit('game:join', {
      sessionId: 'session-1',
      subjectId: 'player-1',
      accessToken: createLiveAccessToken(secret, {
        sessionId: 'session-1',
        subjectId: 'player-1',
        role: 'player',
      }),
      role: 'player',
    });
    await Promise.all([hostSnapshot, playerSnapshot]);

    const hostQuestion = waitFor(host, 'question:started');
    const playerQuestion = waitFor(player, 'question:started');
    host.emit('question:start', { sessionId: 'session-1' });
    const [hostPayload, playerPayload] = await Promise.all([
      hostQuestion,
      playerQuestion,
    ]);
    expect(hostPayload).toEqual(question);
    expect(playerPayload).toEqual(question);
    expect(JSON.stringify(playerPayload)).not.toContain('correct');

    const accepted = waitFor(player, 'answer:accepted');
    player.emit('answer:submit', {
      sessionId: 'session-1',
      questionId: 'question-1',
      optionId: 'a',
    });
    await expect(accepted).resolves.toEqual(
      expect.objectContaining({ questionId: 'question-1' }),
    );
  });
});

function waitFor<EventName extends keyof ServerToClientEvents>(
  socket: BrowserSocket,
  event: EventName | 'connect',
): Promise<
  EventName extends keyof ServerToClientEvents
    ? Parameters<ServerToClientEvents[EventName]>[0]
    : void
> {
  return new Promise((resolve) => {
    socket.once(event as keyof ServerToClientEvents, (payload: unknown) =>
      resolve(payload as never),
    );
  });
}
