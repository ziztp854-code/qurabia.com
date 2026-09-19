import {
  PARALLEL_WORLD_BANK,
  REVERSE_TIME_BANK,
  SPECIAL_GAME_META,
  SPECIAL_GAME_ORDER,
} from '@tahaddi/domain';
import type { RedisService } from '../game/redis.service.js';
import { SpecialGamesService } from './special-games.service.js';
import type { SpecialGameRoom } from './types.js';

const aiParallelRounds = ['alpha', 'beta', 'gamma'].map((id) => ({
  id: `grok-${id}`,
  answer: `إجابة ${id}`,
  reveal: `هذا كشف مخصص صالح للجولة ${id}.`,
  variants: ['geography', 'history', 'culture', 'tourism'].map(
    (face, index) => ({
      face: face as 'geography' | 'history' | 'culture' | 'tourism',
      faceLabel: `مجال ${index + 1}`,
      prompt: `سؤال Grok المخصص ${id} رقم ${index + 1}؟`,
      options: [`إجابة ${id}`, 'خيار ب', 'خيار ج', 'خيار د'],
    }),
  ),
}));

class MemoryRoomStore {
  rooms = new Map<string, SpecialGameRoom>();
  activePins = new Set<string>();
  locks = new Map<string, string>();

  saveSpecialRoom(pin: string, room: SpecialGameRoom) {
    this.rooms.set(pin, structuredClone(room));
    return Promise.resolve();
  }

  loadSpecialRoom<T>(pin: string): Promise<T | null> {
    return Promise.resolve(
      (structuredClone(this.rooms.get(pin)) as T | undefined) ?? null,
    );
  }

  deleteSpecialRoom(pin: string) {
    this.rooms.delete(pin);
    return Promise.resolve();
  }

  addActivePin(pin: string) {
    this.activePins.add(pin);
    return Promise.resolve();
  }

  removeActivePin(pin: string) {
    this.activePins.delete(pin);
    return Promise.resolve();
  }

  isPinActive(pin: string) {
    return Promise.resolve(this.activePins.has(pin));
  }

  acquireSpecialRoomLock(pin: string, token: string) {
    if (this.locks.has(pin)) return Promise.resolve(false);
    this.locks.set(pin, token);
    return Promise.resolve(true);
  }

  releaseSpecialRoomLock(pin: string, token: string) {
    if (this.locks.get(pin) === token) this.locks.delete(pin);
    return Promise.resolve();
  }
}

type EmittedEvent = { target: string; event: string; payload: unknown };

function createIoRecorder() {
  const events: EmittedEvent[] = [];
  return {
    events,
    server: {
      to(target: string) {
        return {
          emit(event: string, payload: unknown) {
            events.push({ target, event, payload });
          },
        };
      },
    },
  };
}

describe('SpecialGamesService', () => {
  function setup() {
    const store = new MemoryRoomStore();
    const io = createIoRecorder();
    const service = new SpecialGamesService(store as unknown as RedisService);
    service.setServer(io.server as never);
    return { service, store, events: io.events };
  }

  it('distributes different parallel questions that share one answer', async () => {
    const { service, events } = setup();
    const room = await service.createRoom('host-1', SPECIAL_GAME_ORDER[0]);

    await service.joinRoom('player-1', room.pin, 'سارة');
    await service.joinRoom('player-2', room.pin, 'فيصل');
    const started = await service.startGame(room.pin, 'host-1');

    expect(started.ok).toBe(true);
    const questions = events
      .filter((event) => event.event === 'parallel:round')
      .map((event) => event.payload as { prompt: string; options: string[] });
    expect(questions).toHaveLength(2);
    expect(questions[0]?.prompt).not.toBe(questions[1]?.prompt);
    expect(
      questions.every((question) =>
        question.options.includes(PARALLEL_WORLD_BANK[0].answer),
      ),
    ).toBe(true);
  });

  it('runs a server-authoritative risk turn without exposing hidden cards', async () => {
    const { service, events } = setup();
    const room = await service.createRoom('host-risk', 'risk');
    await service.joinRoom('player-1', room.pin, 'سارة');
    await service.joinRoom('player-2', room.pin, 'فيصل');

    const started = await service.startGame(room.pin, 'host-risk');
    expect(started.ok).toBe(true);

    const initialState = events.find((event) => event.event === 'risk:state')
      ?.payload as {
      activePlayerId: string;
      cards: Array<{ id: string; revealed: boolean; kind?: string }>;
    };
    expect(initialState.activePlayerId).toBe('player-1');
    expect(initialState.cards).toHaveLength(24);
    expect(
      initialState.cards.every(
        (card) => !card.revealed && card.kind === undefined,
      ),
    ).toBe(true);

    const firstCardId = initialState.cards.at(0)?.id;
    expect(firstCardId).toBeDefined();
    if (!firstCardId)
      throw new Error('Expected the risk deck to contain a card.');
    const selected = await service.selectRiskCard(
      'player-1',
      room.pin,
      firstCardId,
    );
    expect(selected.ok).toBe(true);
    const latestState = events
      .filter((event) => event.event === 'risk:state')
      .at(-1)?.payload as {
      cards: Array<{ id: string; revealed: boolean; kind?: string }>;
    };
    expect(latestState.cards.filter((card) => card.revealed)).toHaveLength(1);
    expect(
      latestState.cards
        .filter((card) => !card.revealed)
        .every((card) => card.kind === undefined),
    ).toBe(true);
  });

  it('rejects duplicate sockets and caps a special-game room at eight players', async () => {
    const { service } = setup();
    const room = await service.createRoom('host-capacity', 'risk');
    for (let index = 0; index < 8; index += 1) {
      const joined = await service.joinRoom(
        `player-${index}`,
        room.pin,
        `لاعب ${index + 1}`,
      );
      expect(joined.ok).toBe(true);
    }
    const duplicate = await service.joinRoom('player-0', room.pin, 'لاعب جديد');
    const full = await service.joinRoom('player-9', room.pin, 'اللاعب التاسع');

    expect(duplicate).toMatchObject({ ok: false, code: 'ALREADY_JOINED' });
    expect(full).toMatchObject({ ok: false, code: 'ROOM_FULL' });
  });

  it('keeps an active risk round available during a temporary disconnect', async () => {
    const { service, store } = setup();
    const room = await service.createRoom('host-risk', 'risk');
    await service.joinRoom('player-1', room.pin, 'سارة');
    await service.joinRoom('player-2', room.pin, 'فيصل');
    await service.joinRoom('player-3', room.pin, 'نور');
    await service.startGame(room.pin, 'host-risk');

    await service.playerLeft('player-1', room.pin);

    const saved = await store.loadSpecialRoom<SpecialGameRoom>(room.pin);
    expect(saved).toMatchObject({ phase: 'risk-turn', riskCurrentPlayer: 0 });
    expect(saved?.players.map((player) => player.id)).toEqual([
      'player-1',
      'player-2',
      'player-3',
    ]);
  });

  it('restores risk host and player identities after socket reconnects', async () => {
    const { service } = setup();
    const room = await service.createRoom(
      'host-old',
      'risk',
      undefined,
      'host-token-hash',
    );
    await service.joinRoom('player-old', room.pin, 'سارة', 'player-token-hash');
    await service.joinRoom('player-2', room.pin, 'فيصل', 'second-token-hash');
    await service.startGame(room.pin, 'host-old');

    await service.playerLeft('host-old', room.pin);
    await service.playerLeft('player-old', room.pin);
    const hostResume = await service.resumeRiskRoom(
      'host-new',
      room.pin,
      'host-token-hash',
    );
    const playerResume = await service.resumeRiskRoom(
      'player-new',
      room.pin,
      'player-token-hash',
    );

    expect(hostResume).toMatchObject({ ok: true });
    expect(playerResume).toMatchObject({ ok: true });
    if (!playerResume.ok) throw new Error('Expected player resume to succeed.');
    expect(playerResume.room.hostId).toBe('host-new');
    expect(playerResume.room.players[0]?.id).toBe('player-new');
  });

  it('normalizes rooms saved before risk session tokens existed', async () => {
    const { service, store } = setup();
    const room = await service.createRoom('host-old', 'reverse-time');
    await service.joinRoom('player-old', room.pin, 'سارة');
    const legacyRoom = await store.loadSpecialRoom<SpecialGameRoom>(room.pin);
    if (!legacyRoom) throw new Error('Expected the legacy room to exist.');
    delete (legacyRoom as Partial<SpecialGameRoom>).riskPlayerTokenHashes;
    await store.saveSpecialRoom(room.pin, legacyRoom);

    await expect(
      service.leaveRoom('player-old', room.pin),
    ).resolves.toMatchObject({ ok: true });
  });

  it.each(['parallel-world', 'infiltrator'] as const)(
    'uses an approved Grok pack for %s',
    async (mode) => {
      const { service, events } = setup();
      const room = await service.createRoom('host-ai', mode, {
        mode,
        rounds: aiParallelRounds,
      });
      const minimum = SPECIAL_GAME_META[mode].minimumPlayers;
      for (let index = 0; index < minimum; index += 1) {
        await service.joinRoom(
          `ai-player-${index}`,
          room.pin,
          `لاعب ${index + 1}`,
        );
      }
      await service.startGame(room.pin, 'host-ai');
      const eventName =
        mode === 'infiltrator' ? 'infiltrator:round' : 'parallel:round';
      const prompts = events
        .filter((event) => event.event === eventName)
        .map((event) => (event.payload as { prompt: string }).prompt);
      expect(prompts.length).toBe(minimum);
      expect(prompts.every((prompt) => prompt.includes('Grok المخصص'))).toBe(
        true,
      );
    },
  );

  it('uses an approved Grok pack for reverse time', async () => {
    const { service, events } = setup();
    const rounds = ['ألف', 'باء', 'جيم'].map((answer, index) => ({
      id: `grok-reverse-${index}`,
      answer,
      category: 'مخصص',
      hint: `تلميح Grok المخصص رقم ${index + 1}`,
    }));
    const room = await service.createRoom('host-ai', 'reverse-time', {
      mode: 'reverse-time',
      rounds,
    });
    for (let index = 0; index < 3; index += 1) {
      await service.joinRoom(
        `reverse-ai-${index}`,
        room.pin,
        `لاعب ${index + 1}`,
      );
    }
    await service.startGame(room.pin, 'host-ai');
    const payload = events.find((event) => event.event === 'reverse:round')
      ?.payload as { answer: string; hint: string } | undefined;
    expect(payload?.answer).toBe('ألف');
    expect(payload?.hint).toContain('Grok');
  });

  it('scores parallel answers and reveals automatically when everyone answered', async () => {
    const { service, events } = setup();
    const room = await service.createRoom('host-1', SPECIAL_GAME_ORDER[0]);
    await service.joinRoom('player-1', room.pin, 'سارة');
    await service.joinRoom('player-2', room.pin, 'فيصل');
    await service.startGame(room.pin, 'host-1');
    const round = PARALLEL_WORLD_BANK[0];

    await service.submitParallelAnswer(
      'player-1',
      room.pin,
      round.id,
      round.answer,
    );
    await service.submitParallelAnswer(
      'player-2',
      room.pin,
      round.id,
      'إجابة أخرى',
    );

    const reveal = events.find((event) => event.event === 'parallel:reveal');
    expect(reveal).toBeDefined();
    const result = reveal?.payload as {
      answer: string;
      results: Array<{ correct: boolean }>;
    };
    expect(result.answer).toBe(round.answer);
    expect(result.results.map((item) => item.correct)).toEqual([true, false]);
  });

  it('serializes simultaneous answers so no player update is lost', async () => {
    const { service, store, events } = setup();
    const room = await service.createRoom('host-1', SPECIAL_GAME_ORDER[0]);
    const playerIds = ['player-1', 'player-2', 'player-3'];
    for (const [index, playerId] of playerIds.entries()) {
      await service.joinRoom(playerId, room.pin, `لاعب ${index + 1}`);
    }
    await service.startGame(room.pin, 'host-1');
    const round = PARALLEL_WORLD_BANK[0];

    await Promise.all(
      playerIds.map((playerId) =>
        service.executeWithRoomLock(room.pin, () =>
          service.submitParallelAnswer(
            playerId,
            room.pin,
            round.id,
            round.answer,
          ),
        ),
      ),
    );

    expect(
      Object.keys(store.rooms.get(room.pin)?.parallelAnswers ?? {}),
    ).toHaveLength(3);
    expect(
      events.filter((event) => event.event === 'parallel:reveal'),
    ).toHaveLength(1);
  });

  it('runs writing, anonymous voting, and results for the second room mode', async () => {
    const { service, events } = setup();
    const room = await service.createRoom('host-1', SPECIAL_GAME_ORDER[1]);
    await service.joinRoom('player-1', room.pin, 'سارة');
    await service.joinRoom('player-2', room.pin, 'فيصل');
    await service.joinRoom('player-3', room.pin, 'نور');
    await service.startGame(room.pin, 'host-1');
    const round = REVERSE_TIME_BANK[0];

    await service.submitReverseQuestion(
      'player-1',
      room.pin,
      round.id,
      'في أي مدينة يقع قصر المصمك؟',
    );
    await service.submitReverseQuestion(
      'player-2',
      room.pin,
      round.id,
      'أين يُقام أكبر موسم ترفيهي في المملكة؟',
    );
    await service.submitReverseQuestion(
      'player-3',
      room.pin,
      round.id,
      'ما المدينة التي تتوسط المملكة؟',
    );

    const votingEvents = events.filter(
      (event) => event.event === 'reverse:voting',
    );
    expect(votingEvents).toHaveLength(3);
    const playerOneBallot = votingEvents.find(
      (event) => event.target === 'player-1',
    )?.payload as {
      submissions: Array<{ id: string; isOwn: boolean }>;
    };
    expect(
      playerOneBallot.submissions.filter((item) => item.isOwn),
    ).toHaveLength(1);

    const ids = playerOneBallot.submissions.map((item) => item.id);
    await service.voteReverse('player-1', room.pin, ids[1]);
    await service.voteReverse('player-2', room.pin, ids[0]);
    await service.voteReverse('player-3', room.pin, ids[0]);

    const results = events.find((event) => event.event === 'reverse:results')
      ?.payload as {
      answer: string;
      results: Array<{ votes: number }>;
    };
    expect(results.answer).toBe(round.answer);
    expect(results.results[0]?.votes).toBe(2);
  });

  it('rejects reverse votes from sockets that never joined the room', async () => {
    const { service, store, events } = setup();
    const room = await service.createRoom('host-1', SPECIAL_GAME_ORDER[1]);
    const players = ['player-1', 'player-2', 'player-3'];
    for (const [index, playerId] of players.entries()) {
      await service.joinRoom(playerId, room.pin, `لاعب ${index + 1}`);
    }
    await service.startGame(room.pin, 'host-1');
    const round = REVERSE_TIME_BANK[0];
    for (const [index, playerId] of players.entries()) {
      await service.submitReverseQuestion(
        playerId,
        room.pin,
        round.id,
        `ما السؤال الصحيح رقم ${index + 1} في هذه الجولة؟`,
      );
    }
    const ballot = events.find((event) => event.event === 'reverse:voting')
      ?.payload as { submissions: Array<{ id: string }> };

    const result = await service.voteReverse(
      'outsider-socket',
      room.pin,
      ballot.submissions[0].id,
    );

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: 'NOT_PLAYER' }),
    );
    expect(store.rooms.get(room.pin)?.reverseVoterIds).toEqual([]);
  });

  it('rejects every room mode below its declared minimum with a clear Arabic message', async () => {
    const { service } = setup();
    for (const mode of SPECIAL_GAME_ORDER) {
      const room = await service.createRoom(`host-${mode}`, mode);
      const minimum = SPECIAL_GAME_META[mode].minimumPlayers;
      for (let index = 0; index < minimum - 1; index += 1) {
        await service.joinRoom(
          `${mode}-player-${index}`,
          room.pin,
          `لاعب ${index + 1}`,
        );
      }

      const result = await service.startGame(room.pin, `host-${mode}`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_ENOUGH_PLAYERS');
        expect(result.message).toMatch(/لاعبين على الأقل/);
      }
    }
  });

  it('runs distribution, anonymous answers, voting, guess, and reveal for the third mode', async () => {
    const { service, store, events } = setup();
    const room = await service.createRoom('host-1', SPECIAL_GAME_ORDER[2]);
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4'];
    for (const [index, playerId] of playerIds.entries()) {
      await service.joinRoom(playerId, room.pin, `لاعب ${index + 1}`);
    }

    const started = await service.startGame(room.pin, 'host-1');
    expect(started.ok).toBe(true);
    const distributed = events.filter(
      (event) => event.event === 'infiltrator:round',
    );
    expect(distributed).toHaveLength(4);
    expect(
      distributed.filter(
        (event) => (event.payload as { isInfiltrator: boolean }).isInfiltrator,
      ),
    ).toHaveLength(1);

    const activeRoom = store.rooms.get(room.pin);
    expect(activeRoom?.infiltratorId).toBeTruthy();
    for (const playerId of playerIds) {
      const assignment = activeRoom?.infiltratorAssignments[playerId];
      const assignedRound = assignment
        ? PARALLEL_WORLD_BANK[assignment.bankIndex]
        : undefined;
      const variant = assignedRound?.variants[assignment?.variantIndex ?? 0];
      expect(variant).toBeDefined();
      await service.submitInfiltratorAnswer(
        playerId,
        room.pin,
        PARALLEL_WORLD_BANK[0].id,
        variant?.options[0] ?? '',
      );
    }

    const ballots = events.filter(
      (event) => event.event === 'infiltrator:voting',
    );
    expect(ballots).toHaveLength(4);
    expect(
      ballots.every((event) =>
        (
          event.payload as { answers: Array<{ playerName?: string }> }
        ).answers.every((answer) => answer.playerName === undefined),
      ),
    ).toBe(true);

    const infiltratorId = activeRoom?.infiltratorId;
    expect(infiltratorId).toBeTruthy();
    for (const playerId of playerIds) {
      await service.voteInfiltrator(
        playerId,
        room.pin,
        playerId === infiltratorId
          ? (playerIds.find((candidate) => candidate !== playerId) ??
              playerIds[0])
          : (infiltratorId ?? ''),
      );
    }
    await service.guessInfiltratorMajority(
      infiltratorId ?? '',
      room.pin,
      PARALLEL_WORLD_BANK[0].variants[0].prompt,
    );

    const reveal = events.find((event) => event.event === 'infiltrator:reveal')
      ?.payload as { caught: boolean; infiltratorId: string };
    expect(reveal).toMatchObject({ caught: true, infiltratorId });
  });

  it('returns an active round to the lobby if its infiltrator disconnects', async () => {
    const { service, store, events } = setup();
    const room = await service.createRoom('host-1', SPECIAL_GAME_ORDER[2]);
    for (let index = 0; index < 4; index += 1) {
      await service.joinRoom(`player-${index}`, room.pin, `لاعب ${index + 1}`);
    }
    await service.startGame(room.pin, 'host-1');
    const infiltratorId = store.rooms.get(room.pin)?.infiltratorId;
    expect(infiltratorId).toBeTruthy();

    await service.playerLeft(infiltratorId ?? '', room.pin);

    expect(store.rooms.get(room.pin)?.phase).toBe('lobby');
    expect(
      events.some(
        (event) =>
          event.event === 'special:error' &&
          (event.payload as { code: string }).code === 'ROUND_RESET',
      ),
    ).toBe(true);
  });
});
