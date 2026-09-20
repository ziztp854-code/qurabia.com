import { GameService } from './game.service.js';
import type { PlayerInfo } from '@tahaddi/contracts';

function makeSession() {
  const startedAt = new Date(Date.now() - 1_000);
  return {
    id: 'session-1',
    roomCode: 'ABC123',
    hostId: 'host-1',
    host: { status: 'ACTIVE', tokenVersion: 3 },
    status: 'ACTIVE',
    currentQuestionPosition: 0,
    questionStartedAt: startedAt,
    questionRevealedAt: null as Date | null,
    endedAt: null as Date | null,
    quiz: {
      autoAdvance: true,
      speedScoring: true,
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
        user: null as { status: string } | null,
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
      acquireTransition: jest.fn().mockResolvedValue(true),
      releaseTransition: jest.fn(),
    };
    const transaction = {
      liveSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
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
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        liveParticipant: {
          updateMany: jest.fn(),
          count: jest.fn().mockResolvedValue(1),
        },
        liveParticipantConnection: {
          upsert: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(
          async (callback: (value: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      },
    };
    const io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    const pushNotifications = {
      notifyGameStarted: jest.fn().mockResolvedValue(undefined),
    };
    const service = new GameService(
      redis as never,
      database as never,
      pushNotifications as never,
    );
    service.setServer(io as never);
    return {
      service,
      redis,
      database,
      transaction,
      io,
      pushNotifications,
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

  it.each(['ACTIVE', 'SUSPENDED'])(
    'checks a linked %s account before joining and answering',
    async (status) => {
      const session = makeSession();
      session.participants[0].user = { status };
      const { service } = setup(session);
      const identity = {
        sessionId: session.id,
        subjectId: 'player-1',
        role: 'player' as const,
      };
      await expect(service.validateIdentity(identity)).resolves.toBe(
        status === 'ACTIVE',
      );
      await expect(
        service.submitAnswer(identity, 'socket-1', {
          questionId: 'question-1',
          optionId: 'option-1',
        }),
      ).resolves.toBe(status === 'ACTIVE');
    },
  );

  it('revokes a host ticket when the account version changes or the host is suspended', async () => {
    const session = makeSession();
    const { service } = setup(session);
    const identity = {
      sessionId: session.id,
      subjectId: session.hostId,
      role: 'host' as const,
      subjectVersion: 3,
    };

    await expect(service.validateIdentity(identity)).resolves.toBe(true);
    identity.subjectVersion = 2;
    await expect(service.validateIdentity(identity)).resolves.toBe(false);
    identity.subjectVersion = 3;
    session.host.status = 'SUSPENDED';
    await expect(service.validateIdentity(identity)).resolves.toBe(false);
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

  it('keeps a reconnected player present when an older socket disconnects', async () => {
    const { service, database, io } = setup();
    database.client.liveParticipantConnection.count.mockResolvedValue(1);

    await service.disconnected(
      { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
      'old-socket',
    );

    expect(
      database.client.liveParticipantConnection.updateMany,
    ).toHaveBeenCalled();
    expect(database.client.liveParticipant.updateMany).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalledWith(
      'game:player_left',
      expect.anything(),
    );
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

  it('broadcasts the final leaderboard to connected players', async () => {
    const session = makeSession();
    session.participants[0].score = 975;
    const { service, io } = setup(session);
    const playerEmit = jest.fn();
    io.to.mockImplementation((room: string) =>
      room === 'live:session-1' ? { emit: playerEmit } : io,
    );

    await expect(service.finishGame(session.id, session.hostId)).resolves.toBe(
      true,
    );

    expect(playerEmit).toHaveBeenCalledWith('game:finished', {
      sessionId: session.id,
      leaderboard: [expect.objectContaining({ id: 'player-1', score: 975 })],
    });
  });

  it('does not rewrite the completion time when finishing again', async () => {
    const session = makeSession();
    session.status = 'FINISHED';
    session.endedAt = new Date(Date.now() - 60_000);
    const { service, database } = setup(session);

    await expect(service.finishGame(session.id, session.hostId)).resolves.toBe(
      true,
    );

    expect(database.client.liveSession.update).not.toHaveBeenCalled();
    expect(database.client.liveSession.updateMany).not.toHaveBeenCalled();
  });

  it('does not finish during another transition or for another host', async () => {
    const { service, redis, database } = setup();
    redis.acquireTransition.mockResolvedValueOnce(false);
    await expect(service.finishGame('session-1', 'host-1')).resolves.toBe(
      false,
    );
    expect(redis.releaseTransition).not.toHaveBeenCalled();
    await expect(service.finishGame('session-1', 'other-host')).resolves.toBe(
      false,
    );
    expect(redis.releaseTransition).toHaveBeenCalledWith('session-1');
    expect(database.client.liveSession.updateMany).not.toHaveBeenCalled();
  });

  it('finishes after the last question while retaining the existing transition lock', async () => {
    const { service, redis, database, io } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'LEADERBOARD',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 20_000,
      questionEndsAt: Date.now() - 1,
      transitionDueAt: Date.now(),
    });

    await expect(service.startQuestion('session-1', 'host-1')).resolves.toBe(
      true,
    );

    expect(redis.acquireTransition).toHaveBeenCalledTimes(1);
    expect(redis.releaseTransition).toHaveBeenCalledTimes(1);
    expect(database.client.liveSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', status: { not: 'FINISHED' } },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
        questionAdvanceAt: null,
      },
    });
    expect(io.emit).toHaveBeenCalledWith(
      'game:finished',
      expect.objectContaining({
        sessionId: 'session-1',
        leaderboard: [expect.objectContaining({ id: 'player-1' })],
      }),
    );
  });

  it('notifies registered participants only on the first game transition without blocking it', async () => {
    const session = makeSession();
    session.status = 'WAITING';
    const { service, redis, pushNotifications } = setup(session);
    redis.loadGameState.mockResolvedValue({
      sessionId: session.id,
      roomCode: session.roomCode,
      phase: 'LOBBY',
      currentQuestionPosition: 0,
      questionStartedAt: null,
      questionEndsAt: null,
      transitionDueAt: null,
    });
    pushNotifications.notifyGameStarted.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    await expect(
      service.startQuestion(session.id, session.hostId),
    ).resolves.toBe(true);
    await Promise.resolve();

    expect(pushNotifications.notifyGameStarted).toHaveBeenCalledWith({
      sessionId: session.id,
      roomCode: session.roomCode,
    });
  });

  it('honors a persisted finish when Redis still holds an active question', async () => {
    const session = makeSession();
    session.status = 'FINISHED';
    session.participants[0].score = 975;
    const { service } = setup(session);

    const snapshot = await service.getSnapshot({
      sessionId: session.id,
      subjectId: 'player-1',
      role: 'player',
    });

    expect(snapshot?.phase).toBe('FINISHED');
    expect(snapshot?.question).toBeNull();
    expect(snapshot?.leaderboard[0].score).toBe(975);
  });

  it.each(['missing', 'stale'])(
    'restores a revealed question with %s Redis state and refuses more answers',
    async (cache) => {
      const session = makeSession();
      session.questionRevealedAt = new Date();
      const { service, redis, database } = setup(session);
      if (cache === 'missing') redis.loadGameState.mockResolvedValue(null);

      const snapshot = await service.getSnapshot({
        sessionId: session.id,
        subjectId: 'player-1',
        role: 'player',
      });

      expect(snapshot?.phase).toBe('REVEAL');
      expect(snapshot?.reveal?.correctOptionId).toBe('option-1');
      await expect(
        service.submitAnswer(
          { sessionId: session.id, subjectId: 'player-1', role: 'player' },
          'socket-1',
          { questionId: 'question-1', optionId: 'option-1' },
        ),
      ).resolves.toBe(false);
      expect(database.client.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['reveal', 'skip'])(
    'waits for pending answers before %s exposes the correct option',
    async (action) => {
      const { service, database, io, session } = setup();
      let commit!: (result: { count: number }) => void;
      database.client.liveSession.updateMany.mockImplementation(
        () =>
          new Promise((resolve) => {
            commit = resolve;
          }),
      );
      const pending =
        action === 'reveal'
          ? service.revealQuestion(session.id, 'question-1')
          : service.skip(session.id, session.hostId);
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(io.emit).not.toHaveBeenCalled();
      expect(commit).toBeDefined();
      session.participants[0].score = 975;
      session.answers.push({
        participantId: 'player-1',
        questionId: 'question-1',
        optionId: 'option-1',
        isCorrect: true,
        earnedPoints: 975,
        receivedAt: new Date(),
      } as never);
      commit({ count: 1 });
      await expect(pending).resolves.toBe(true);
      expect(io.emit).toHaveBeenCalledWith(
        'question:revealed',
        expect.objectContaining({
          playerResult: expect.objectContaining({
            totalScore: 975,
            earnedPoints: 975,
          }) as unknown,
        }),
      );
      expect(database.client.liveSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: session.id,
          status: 'ACTIVE',
          currentQuestionPosition: 0,
          questionStartedAt: session.questionStartedAt,
          questionRevealedAt: null,
        },
        data: { questionRevealedAt: new Date() },
      });
    },
  );

  it.each(['reveal', 'skip'])(
    'does not expose a stale question when %s loses the database transition',
    async (action) => {
      const { service, database, io } = setup();
      database.client.liveSession.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        action === 'reveal'
          ? service.revealQuestion('session-1', 'question-1')
          : service.skip('session-1', 'host-1'),
      ).resolves.toBe(false);
      expect(io.emit).not.toHaveBeenCalled();
    },
  );

  it('clears the reveal marker when starting the next question', async () => {
    const session = makeSession();
    session.questionRevealedAt = new Date();
    session.quiz.questions.push({
      ...session.quiz.questions[0],
      position: 1,
      question: { ...session.quiz.questions[0].question, id: 'question-2' },
    });
    const { service, redis, database, io, pushNotifications } = setup(session);
    redis.loadGameState.mockResolvedValue({
      sessionId: session.id,
      roomCode: session.roomCode,
      phase: 'LEADERBOARD',
      currentQuestionPosition: 0,
      questionStartedAt: session.questionStartedAt.getTime(),
      questionEndsAt: Date.now(),
    });
    await expect(
      service.startQuestion(session.id, session.hostId),
    ).resolves.toBe(true);
    expect(database.client.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentQuestionPosition: 1,
          questionRevealedAt: null,
        }) as unknown,
      }),
    );
    expect(io.emit).toHaveBeenCalledWith(
      'question:started',
      expect.objectContaining({ questionId: 'question-2' }),
    );
    expect(pushNotifications.notifyGameStarted).not.toHaveBeenCalled();
  });

  it('rejects an answer whose question was revealed before its transaction acquired the session', async () => {
    const { service, transaction, io } = setup();
    transaction.liveSession.updateMany.mockImplementation(
      (...args: unknown[]) => {
        const input = args[0] as { where: { questionRevealedAt?: null } };
        return Promise.resolve({
          count: input.where.questionRevealedAt === null ? 0 : 1,
        });
      },
    );
    await expect(
      service.submitAnswer(
        { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
        'socket-1',
        { questionId: 'question-1', optionId: 'option-1' },
      ),
    ).resolves.toBe(false);
    expect(transaction.liveAnswer.create).not.toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalledWith('answer:rejected', {
      questionId: 'question-1',
      reason: 'QUESTION_NOT_ACTIVE',
    });
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

  it('rejects an answer if the session finished or advanced before its transaction', async () => {
    const { service, transaction, io } = setup();
    transaction.liveSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.submitAnswer(
        { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
        'socket-1',
        { questionId: 'question-1', optionId: 'option-1' },
      ),
    ).resolves.toBe(false);

    expect(transaction.liveAnswer.create).not.toHaveBeenCalled();
    expect(transaction.liveParticipant.update).not.toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalledWith('answer:rejected', {
      questionId: 'question-1',
      reason: 'QUESTION_NOT_ACTIVE',
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

  it('awards full override points when speed scoring is disabled', async () => {
    const session = makeSession();
    session.quiz.speedScoring = false;
    session.quiz.questions[0].pointsOverride = 2_000;
    const { service, savedAnswerPoints } = setup(session);

    await service.submitAnswer(
      { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
      'socket-1',
      {
        questionId: 'question-1',
        optionId: 'option-1',
        receivedAt: session.questionStartedAt.getTime() + 19_000,
      },
    );

    expect(savedAnswerPoints()).toBe(2_000);
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
    const { redis, database, io, pushNotifications } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'QUESTION',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 1_000,
      questionEndsAt: Date.now() + 2_000,
      transitionDueAt: null,
    });
    const restarted = new GameService(
      redis as never,
      database as never,
      pushNotifications as never,
    );
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
    const { redis, database, io, pushNotifications } = setup();
    redis.loadGameState.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'LEADERBOARD',
      currentQuestionPosition: 0,
      questionStartedAt: Date.now() - 20_000,
      questionEndsAt: Date.now() - 1,
      transitionDueAt: Date.now() + 2_500,
    });
    const restarted = new GameService(
      redis as never,
      database as never,
      pushNotifications as never,
    );
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
