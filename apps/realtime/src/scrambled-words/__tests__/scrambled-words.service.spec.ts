import { Test, TestingModule } from '@nestjs/testing';
import type { ScrambledWordsPlayer } from '@tahaddi/domain';
import type { ScrambledWordsRoomRuntime } from '../scrambled-words.types.js';
import { DatabaseService } from '../../game/database.service.js';
import { RedisService } from '../../game/redis.service.js';
import { ScrambledWordsService } from '../scrambled-words.service.js';

describe('ScrambledWordsService', () => {
  let service: ScrambledWordsService;
  let redis: {
    loadScrambledRoom: jest.Mock;
    saveScrambledRoom: jest.Mock;
    deleteScrambledRoom: jest.Mock;
    addActiveScrambledRoomCode: jest.Mock;
    removeActiveScrambledRoomCode: jest.Mock;
    isScrambledRoomCodeActive: jest.Mock;
    setScrambledGuestIdentity: jest.Mock;
    getScrambledGuestIdentity: jest.Mock;
    deleteScrambledGuestIdentity: jest.Mock;
    acquireScrambledRoomLock: jest.Mock;
    releaseScrambledRoomLock: jest.Mock;
    consumeRateLimit: jest.Mock;
  };
  let findManyPuzzles: jest.Mock;

  const puzzle = (id: string, words: string[]) => ({
    id,
    imageUrl: `/games/scrambled-words-live/${id}.jpg`,
    words,
  });

  const player = (
    id: string,
    name: string,
    overrides: Partial<ScrambledWordsPlayer> = {},
  ): ScrambledWordsPlayer => ({
    id,
    name,
    score: 0,
    roundScore: 0,
    solvedWords: [],
    finished: false,
    joinedAt: 1,
    ...overrides,
  });

  const activeRoom = (): ScrambledWordsRoomRuntime => {
    const openedAt = Date.now();
    return {
      roomCode: 'ABC234',
      hostId: 'host-1',
      status: 'active',
      totalRounds: 3,
      currentRound: 1,
      roundTimeLimit: 60,
      firstFinish: false,
      puzzleOrder: ['pz1', 'pz2'],
      usedPuzzleIds: ['pz1'],
      currentPuzzle: {
        id: 'pz1',
        imageUrl: '/games/scrambled-words-live/pz1.jpg',
        words: ['بحر', 'امواج', 'شاطئ'],
      },
      currentFragments: ['بح', 'ر', 'ام', 'واج', 'شا', 'طئ'],
      puzzleOpenedAt: openedAt,
      puzzleDeadlineAt: openedAt + 60_000,
      players: [player('player-1', 'سالم'), player('player-2', 'ريم')],
      lastRoundWords: [],
      lastRoundResults: [],
      createdAt: openedAt,
      updatedAt: openedAt,
      scoringPolicyVersion: 1,
    };
  };

  beforeEach(async () => {
    redis = {
      loadScrambledRoom: jest.fn(),
      saveScrambledRoom: jest.fn(),
      deleteScrambledRoom: jest.fn(),
      addActiveScrambledRoomCode: jest.fn(),
      removeActiveScrambledRoomCode: jest.fn(),
      isScrambledRoomCodeActive: jest.fn().mockResolvedValue(false),
      setScrambledGuestIdentity: jest.fn(),
      getScrambledGuestIdentity: jest.fn(),
      deleteScrambledGuestIdentity: jest.fn(),
      acquireScrambledRoomLock: jest.fn().mockResolvedValue(true),
      releaseScrambledRoomLock: jest.fn().mockResolvedValue(undefined),
      consumeRateLimit: jest.fn().mockResolvedValue(true),
    };
    findManyPuzzles = jest
      .fn()
      .mockResolvedValue([
        puzzle('pz1', ['بحر', 'امواج', 'شاطئ']),
        puzzle('pz2', ['قمر', 'نجوم']),
      ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScrambledWordsService,
        { provide: RedisService, useValue: redis },
        {
          provide: DatabaseService,
          useValue: {
            client: { scrambledWordsPuzzle: { findMany: findManyPuzzles } },
          },
        },
      ],
    }).compile();

    service = module.get(ScrambledWordsService);
  });

  it('refuses to create a room when the puzzle bank is empty', async () => {
    findManyPuzzles.mockResolvedValueOnce([]);
    const result = await service.createRoom(
      { totalRounds: 3, roundTimeLimit: 60, firstFinish: false },
      'host-1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NO_PUZZLES_AVAILABLE');
    }
  });

  it('creates a room with a 6-character code and a shuffled puzzle deck', async () => {
    const result = await service.createRoom(
      { totalRounds: 3, roundTimeLimit: 60, firstFinish: true },
      'host-1',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect([...result.room.puzzleOrder].sort()).toEqual(['pz1', 'pz2']);
      expect(result.room.status).toBe('waiting');
      expect(result.room.firstFinish).toBe(true);
    }
    expect(redis.addActiveScrambledRoomCode).toHaveBeenCalled();
  });

  it('rejects a non-host trying to start the game', async () => {
    redis.loadScrambledRoom.mockResolvedValueOnce(activeRoom());
    const result = await service.startGame('ABC234', 'intruder');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_HOST');
  });

  it('awards one point per unique solved word and reports viewer progress', async () => {
    redis.loadScrambledRoom.mockResolvedValue(activeRoom());
    const result = await service.submitWord(
      'player-1',
      'ABC234',
      'pz1',
      'بحر',
      'sub-0001',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accepted.word).toBe('بحر');
      expect(result.accepted.points).toBe(1);
      expect(result.accepted.solvedWords).toEqual(['بحر']);
      expect(result.accepted.totalScore).toBe(1);
    }
    expect(redis.saveScrambledRoom).toHaveBeenCalled();
  });

  it('rejects duplicate submissions of the same word', async () => {
    const room = activeRoom();
    room.players[0].solvedWords = ['بحر'];
    redis.loadScrambledRoom.mockResolvedValue(room);
    const result = await service.submitWord(
      'player-1',
      'ABC234',
      'pz1',
      'بحر',
      'sub-0002',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WORD_NOT_MATCHED');
  });

  it('accepts normalized arabic variants (alef, teh marbuta)', async () => {
    redis.loadScrambledRoom.mockResolvedValue(activeRoom());
    const result = await service.submitWord(
      'player-1',
      'ABC234',
      'pz1',
      'أمواج',
      'sub-0003',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accepted.word).toBe('امواج');
    }
  });

  it('closes the round and records results when the round expires', async () => {
    const room = activeRoom();
    room.puzzleDeadlineAt = Date.now() - 1_000;
    redis.loadScrambledRoom.mockResolvedValue(room);
    const result = await service.expireRound('ABC234', 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.status).toBe('waiting');
      expect(result.room.lastRoundWords).toEqual(['بحر', 'امواج', 'شاطئ']);
      expect(result.room.currentPuzzle).toBeNull();
      expect(result.room.puzzleDeadlineAt).toBeNull();
    }
  });

  it('finishes the game when the last round closes', async () => {
    const room = activeRoom();
    room.totalRounds = 1;
    room.puzzleDeadlineAt = Date.now() - 1_000;
    redis.loadScrambledRoom.mockResolvedValue(room);
    const result = await service.expireRound('ABC234', 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.status).toBe('finished');
      expect(result.room.endedAt).toBeDefined();
    }
  });

  it('blocks a player who is not in the room from submitting words', async () => {
    redis.loadScrambledRoom.mockResolvedValue(activeRoom());
    const result = await service.submitWord(
      'ghost',
      'ABC234',
      'pz1',
      'بحر',
      'sub-0004',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_A_PLAYER');
  });

  it('rejects submissions after the deadline has passed', async () => {
    const room = activeRoom();
    room.puzzleDeadlineAt = Date.now() - 5;
    redis.loadScrambledRoom.mockResolvedValue(room);
    const result = await service.submitWord(
      'player-1',
      'ABC234',
      'pz1',
      'بحر',
      'sub-0005',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ROUND_EXPIRED');
  });

  it('ends the round early when a player finishes under firstFinish mode', async () => {
    const room = activeRoom();
    room.firstFinish = true;
    room.players[0] = player('player-1', 'سالم', {
      solvedWords: ['بحر', 'امواج'],
      roundScore: 2,
      score: 2,
    });
    redis.loadScrambledRoom.mockResolvedValue(room);
    const result = await service.submitWord(
      'player-1',
      'ABC234',
      'pz1',
      'شاطئ',
      'sub-0006',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.status).toBe('waiting');
      expect(result.room.lastRoundWords).toEqual(['بحر', 'امواج', 'شاطئ']);
      expect(result.room.currentPuzzle).toBeNull();
    }
  });

  it('removes a leaving player and deletes an empty room', async () => {
    const room = activeRoom();
    room.players = [room.players[0]];
    redis.loadScrambledRoom.mockResolvedValue(room);
    const result = await service.leaveRoom('player-1', 'ABC234');
    expect(result.ok).toBe(true);
    expect(redis.deleteScrambledRoom).toHaveBeenCalledWith('ABC234');
    expect(redis.removeActiveScrambledRoomCode).toHaveBeenCalledWith('ABC234');
  });

  it('ends the room when the host leaves', async () => {
    redis.loadScrambledRoom.mockResolvedValue(activeRoom());
    const result = await service.leaveRoom('host-1', 'ABC234');
    expect(result.ok).toBe(false);
    expect(redis.deleteScrambledRoom).toHaveBeenCalledWith('ABC234');
  });

  it('builds viewer-scoped snapshots that never include raw words', () => {
    const room = activeRoom();
    room.players[0].solvedWords = ['بحر'];
    const snapshot = service.buildSnapshot(room, 'player-1', null);
    expect(snapshot.mySolvedWords).toEqual(['بحر']);
    expect(JSON.stringify(snapshot)).not.toContain('"words":[');
    expect(snapshot.currentPuzzle?.wordLengths).toEqual([3, 5, 4]);
  });
});
