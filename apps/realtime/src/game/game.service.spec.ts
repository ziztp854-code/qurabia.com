import { GameService } from './game.service.js';
import type { PlayerInfo } from '@tahaddi/contracts';

function makeSession() {
  const startedAt = new Date(Date.now() - 1_000);
  return {
    id: 'session-1',
    roomCode: 'ABC123',
    hostId: 'host-1',
    status: 'ACTIVE',
    currentQuestionPosition: 0,
    questionStartedAt: startedAt,
    endedAt: null,
    quiz: {
      autoAdvance: true,
      questions: [
        {
          position: 0,
          durationOverride: null as number | null,
          pointsOverride: null as number | null,
          question: {
            id: 'question-1',
            prompt: 'ما الإجابة؟',
            imageUrl: null,
            explanation: 'شرح',
            timeLimit: 20,
            basePoints: 1_000,
            options: [
              { id: 'option-1', text: 'الأولى', position: 0, isCorrect: true },
              {
                id: 'option-2',
                text: 'الثانية',
                position: 1,
                isCorrect: false,
              },
            ],
          },
        },
      ],
    },
    participants: [
      {
        id: 'player-1',
        displayName: 'لاعب',
        score: 0,
        correctCount: 0,
        status: 'CONNECTED',
        joinedAt: new Date(startedAt.getTime() - 500),
      },
    ],
    answers: [],
  };
}

describe('GameService live safety', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function setup(session = makeSession()) {
    let savedAnswerPoints: number | undefined;
    const redis = {
      loadGameState: jest.fn().mockResolvedValue({
        sessionId: session.id,
        roomCode: session.roomCode,
        phase: 'QUESTION',
        currentQuestionPosition: 0,
        questionStartedAt: session.questionStartedAt.getTime(),
        questionEndsAt: session.questionStartedAt.getTime() + 20_000,
      }),
      saveGameState: jest.fn(),
      deleteGameState: jest.fn(),
      acquireTransition: jest.fn().mockResolvedValue(true),
      releaseTransition: jest.fn(),
    };
    const transaction = {
      liveAnswer: {
        create: jest.fn((input: { data: { earnedPoints: number } }) => {
          savedAnswerPoints = input.data.earnedPoints;
        }),
      },
      liveParticipant: { update: jest.fn() },
    };
    const database = {
      client: {
        liveSession: {
          findUnique: jest.fn().mockResolvedValue(session),
          update: jest.fn(),
        },
        liveParticipant: {
          updateMany: jest.fn(),
          count: jest.fn().mockResolvedValue(1),
        },
        liveParticipantConnection: {
          upsert: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn(
          async (callback: (value: typeof transaction) => Promise<void>) =>
            callback(transaction),
        ),
      },
    };
    const io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    const service = new GameService(redis as never, database as never);
    service.setServer(io as never);
    return {
      service,
      redis,
      database,
      transaction,
      io,
      session,
      savedAnswerPoints: () => savedAnswerPoints,
    };
  }

  it('authorizes only the stored host or a participant in the session', async () => {
    const { service } = setup();

    await expect(
      service.validateIdentity({
        sessionId: 'session-1',
        subjectId: 'host-1',
        role: 'host',
      }),
    ).resolves.toBe(true);
    await expect(
      service.validateIdentity({
        sessionId: 'session-1',
        subjectId: 'player-1',
        role: 'player',
      }),
    ).resolves.toBe(true);
    await expect(
      service.validateIdentity({
        sessionId: 'session-1',
        subjectId: 'intruder',
        role: 'player',
      }),
    ).resolves.toBe(false);
  });

  it('does not expose the correct answer in a QUESTION snapshot', async () => {
    const { service } = setup();
    const snapshot = await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });
    expect(snapshot?.phase).toBe('QUESTION');
    expect(snapshot?.reveal).toBeNull();
    expect(snapshot?.question?.options).toEqual([
      { id: 'option-1', text: 'الأولى', position: 0 },
      { id: 'option-2', text: 'الثانية', position: 1 },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('isCorrect');
    expect(snapshot?.leaderboard).toEqual([]);
  });

  it('restores an active question when Redis still contains the lobby', async () => {
    const { service, redis } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'LOBBY',
      currentQuestionPosition: 0,
      questionStartedAt: null,
      questionEndsAt: null,
      transitionDueAt: null,
    });

    const snapshot = await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });

    expect(snapshot?.phase).toBe('QUESTION');
    expect(snapshot?.question?.questionId).toBe('question-1');
  });

  it('keeps a started question when a join read the previous waiting state', async () => {
    const activeSession = makeSession();
    const waitingSession = {
      ...activeSession,
      status: 'WAITING',
      questionStartedAt: null,
    };
    const { service, redis, database } = setup(activeSession);
    database.client.liveSession.findUnique
      .mockResolvedValueOnce(waitingSession)
      .mockResolvedValue(activeSession);

    const snapshot = await service.getSnapshot({
      sessionId: activeSession.id,
      subjectId: 'player-1',
      role: 'player',
    });

    expect(snapshot?.phase).toBe('QUESTION');
    expect(snapshot?.question?.questionId).toBe('question-1');
    expect(redis.deleteGameState).not.toHaveBeenCalled();
  });

  it('persists the first question before publishing it in Redis', async () => {
    const session = makeSession();
    session.status = 'WAITING';
    const { service, redis, database } = setup(session);
    redis.loadGameState.mockResolvedValue({
      sessionId: session.id,
      roomCode: session.roomCode,
      phase: 'LOBBY',
      currentQuestionPosition: 0,
      questionStartedAt: null,
      questionEndsAt: null,
      transitionDueAt: null,
    });
    let finishUpdate!: () => void;
    database.client.liveSession.update.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpdate = () => resolve({});
        }),
    );

    const starting = service.startQuestion(session.id, session.hostId);
    for (let tick = 0; tick < 10 && !finishUpdate; tick += 1)
      await Promise.resolve();
    expect(finishUpdate).toBeDefined();
    expect(redis.saveGameState).not.toHaveBeenCalled();
    finishUpdate();
    await expect(starting).resolves.toBe(true);
    expect(redis.saveGameState).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'QUESTION' }),
    );
  });

  it('notifies the host roster when a player joins without exposing the player leaderboard', async () => {
    const { service, io } = setup();

    const snapshot = await service.joined({
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });

    expect(snapshot?.leaderboard).toEqual([]);
    expect(io.to).toHaveBeenCalledWith('live:session-1');
    const emitted = io.emit.mock.calls[0] as [
      string,
      { player: PlayerInfo; participantCount: number },
    ];
    expect(emitted[0]).toBe('game:player_joined');
    expect(emitted[1].participantCount).toBe(1);
    expect(emitted[1].player).toMatchObject({ id: 'player-1', name: 'لاعب' });
  });

  it('stores server-observed IP and device details on player entry and exit', async () => {
    const { service, database } = setup();
    const identity = {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player' as const,
    };
    const connection = {
      socketId: 'socket-1',
      ipAddress: '203.0.113.44',
      userAgent: 'Mozilla/5.0 Chrome/125.0',
      deviceLabel: 'Chrome على جهاز مكتبي',
      deviceHash: 'device-hash-1',
    };

    await service.joined(identity, connection);
    await service.disconnected(identity, connection.socketId);

    const [participantUpdate] = database.client.liveParticipant.updateMany.mock
      .calls[0] as unknown as [{ data: { lastDeviceHash: string } }];
    expect(participantUpdate.data.lastDeviceHash).toBe('device-hash-1');

    expect(
      database.client.liveParticipantConnection.upsert,
    ).toHaveBeenCalledWith({
      where: { socketId: 'socket-1' },
      create: {
        participantId: 'player-1',
        socketId: 'socket-1',
        ipAddress: '203.0.113.44',
        userAgent: 'Mozilla/5.0 Chrome/125.0',
        deviceLabel: 'Chrome على جهاز مكتبي',
        deviceHash: 'device-hash-1',
      },
      update: {
        disconnectedAt: null,
        ipAddress: '203.0.113.44',
        userAgent: 'Mozilla/5.0 Chrome/125.0',
        deviceLabel: 'Chrome على جهاز مكتبي',
        deviceHash: 'device-hash-1',
      },
    });
    expect(
      database.client.liveParticipantConnection.updateMany,
    ).toHaveBeenCalledTimes(1);
    const [disconnectUpdate] = database.client.liveParticipantConnection
      .updateMany.mock.calls[0] as unknown as [
      {
        where: {
          participantId: string;
          socketId: string;
          disconnectedAt: null;
        };
        data: { disconnectedAt: Date };
      },
    ];
    expect(disconnectUpdate.where).toEqual({
      participantId: 'player-1',
      socketId: 'socket-1',
      disconnectedAt: null,
    });
    expect(disconnectUpdate.data.disconnectedAt).toBeInstanceOf(Date);
  });

  it('includes the real correct-answer count in the host leaderboard', async () => {
    const session = makeSession();
    session.participants[0].correctCount = 7;
    const { service } = setup(session);

    const snapshot = await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });

    expect(snapshot?.leaderboard[0]).toMatchObject({
      id: 'player-1',
      correctAnswers: 7,
    });
  });

  it('restores the finished leaderboard for a reconnecting player', async () => {
    const session = makeSession();
    session.participants[0].correctCount = 7;
    session.participants[0].score = 7_250;
    const { service, redis } = setup(session);
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'FINISHED',
      currentQuestionPosition: 0,
      questionStartedAt: null,
      questionEndsAt: null,
    });

    const snapshot = await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });

    expect(snapshot?.leaderboard).toEqual([
      expect.objectContaining({
        id: 'player-1',
        score: 7_250,
        correctAnswers: 7,
      }),
    ]);
  });

  it('rejects a late answer using server time', async () => {
    const { service, redis, io, database } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'QUESTION',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 30_000,
      questionEndsAt: Date.now() - 1,
    });
    await service.submitAnswer(
      { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
      'socket-1',
      { questionId: 'question-1', optionId: 'option-1' },
    );
    expect(database.client.$transaction).not.toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalledWith('answer:rejected', {
      questionId: 'question-1',
      reason: 'ANSWER_TOO_LATE',
    });
  });

  it('rejects a duplicate answer even after reconnect', async () => {
    const { service, database, io } = setup();
    database.client.$transaction.mockRejectedValue({ code: 'P2002' });
    await service.submitAnswer(
      { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
      'new-socket-after-reconnect',
      { questionId: 'question-1', optionId: 'option-1' },
    );
    expect(io.emit).toHaveBeenCalledWith('answer:rejected', {
      questionId: 'question-1',
      reason: 'DUPLICATE_ANSWER',
    });
  });

  it('preserves the gateway receipt time while loading and scoring', async () => {
    const { service, transaction, session } = setup();
    const receivedAt = session.questionStartedAt.getTime() + 250;

    await service.submitAnswer(
      { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
      'socket-1',
      {
        questionId: 'question-1',
        optionId: 'option-1',
        receivedAt,
      },
    );

    expect(transaction.liveAnswer.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        participantId: 'player-1',
        questionId: 'question-1',
        optionId: 'option-1',
        isCorrect: true,
        earnedPoints: 994,
        receivedAt: new Date(receivedAt),
      },
    });
  });

  it('scores with the quiz question points override', async () => {
    const session = makeSession();
    session.quiz.questions[0].pointsOverride = 2_000;
    const { service, savedAnswerPoints } = setup(session);
    const receivedAt = session.questionStartedAt.getTime() + 250;

    await service.submitAnswer(
      { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
      'socket-1',
      {
        questionId: 'question-1',
        optionId: 'option-1',
        receivedAt,
      },
    );

    expect(savedAnswerPoints()).toBe(1_988);
  });

  it('restores the player answer without exposing other players', async () => {
    const session = makeSession();
    session.answers.push({
      participantId: 'player-1',
      questionId: 'question-1',
      optionId: 'option-2',
      isCorrect: false,
      earnedPoints: 0,
      receivedAt: new Date(),
    } as never);
    const { service } = setup(session);
    const snapshot = await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });
    expect(snapshot?.playerAnswer?.optionId).toBe('option-2');
    expect(snapshot?.leaderboard).toEqual([]);
  });

  it('recreates the question reveal timer after a service restart', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T00:00:00.000Z'));
    const { redis, database, io } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'QUESTION',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 1_000,
      questionEndsAt: Date.now() + 2_000,
      transitionDueAt: null,
    });
    const restarted = new GameService(redis as never, database as never);
    restarted.setServer(io as never);
    const revealQuestion = jest
      .spyOn(restarted, 'revealQuestion')
      .mockResolvedValue(true);

    await restarted.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });
    await jest.advanceTimersByTimeAsync(2_000);

    expect(revealQuestion).toHaveBeenCalledWith('session-1', 'question-1');
  });

  it('recreates the leaderboard timer after a service restart', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T00:00:00.000Z'));
    const { redis, database, io } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'LEADERBOARD',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 20_000,
      questionEndsAt: Date.now() - 1,
      transitionDueAt: Date.now() + 2_500,
    });
    const restarted = new GameService(redis as never, database as never);
    restarted.setServer(io as never);
    const startQuestion = jest
      .spyOn(restarted, 'startQuestion')
      .mockResolvedValue(true);

    await restarted.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });
    await jest.advanceTimersByTimeAsync(2_500);

    expect(startQuestion).toHaveBeenCalledWith('session-1', 'host-1');
  });

  it('advances a legacy leaderboard state without a stored deadline', async () => {
    const { service, redis } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'LEADERBOARD',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 20_000,
      questionEndsAt: Date.now() - 1,
    });
    const startQuestion = jest
      .spyOn(service, 'startQuestion')
      .mockResolvedValue(true);

    await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(startQuestion).toHaveBeenCalledWith('session-1', 'host-1');
  });

  it('does not duplicate the leaderboard timer when snapshots repeat', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T00:00:00.000Z'));
    const { service, redis } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'LEADERBOARD',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 20_000,
      questionEndsAt: Date.now() - 1,
      transitionDueAt: Date.now() + 2_500,
    });
    const startQuestion = jest
      .spyOn(service, 'startQuestion')
      .mockResolvedValue(true);

    await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });
    await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });
    await jest.advanceTimersByTimeAsync(2_500);

    expect(startQuestion).toHaveBeenCalledTimes(1);
    expect(startQuestion).toHaveBeenCalledWith('session-1', 'host-1');
  });

  it('persists the leaderboard deadline before scheduling the next question', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T00:00:00.000Z'));
    const { service, redis } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'REVEAL',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 20_000,
      questionEndsAt: Date.now() - 1,
      transitionDueAt: null,
    });

    await service.next('session-1', 'host-1');

    expect(redis.saveGameState).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'LEADERBOARD',
        transitionDueAt: Date.now() + 2_500,
      }),
    );
  });
});
