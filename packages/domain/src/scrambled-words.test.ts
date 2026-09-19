import { describe, expect, it } from 'vitest';
import {
  buildScrambledWordsFragments,
  buildScrambledWordsRoomSnapshot,
  isScrambledWordsWordSolved,
  normalizeArabicWord,
  SCRAMBLED_WORDS_POINTS_PER_WORD,
  SCRAMBLED_WORDS_SCORING_POLICY_VERSION,
  shuffled,
  splitWordIntoFragments,
  type ScrambledWordsRoom,
} from './scrambled-words';

const ZERO_RANDOM = () => 0;

function makeRoom(overrides: Partial<ScrambledWordsRoom> = {}): ScrambledWordsRoom {
  return {
    roomCode: 'ABC234',
    hostId: 'host-1',
    status: 'active',
    totalRounds: 8,
    currentRound: 1,
    roundTimeLimit: 60,
    firstFinish: false,
    puzzleOrder: ['p1'],
    usedPuzzleIds: ['p1'],
    currentPuzzle: {
      id: 'p1',
      imageUrl: '/games/scrambled-words-live/beach.jpg',
      words: ['بحر', 'امواج', 'شاطئ'],
    },
    currentFragments: ['بح', 'ر', 'ام', 'واج', 'شا', 'طئ'],
    puzzleOpenedAt: 1_000,
    puzzleDeadlineAt: 61_000,
    players: [
      {
        id: 'player-1',
        name: 'سالم',
        score: 2,
        roundScore: 2,
        solvedWords: ['بحر', 'امواج'],
        finished: false,
        joinedAt: 1,
      },
      {
        id: 'player-2',
        name: 'ريم',
        score: 0,
        roundScore: 0,
        solvedWords: [],
        finished: false,
        joinedAt: 2,
      },
    ],
    lastRoundWords: [],
    lastRoundResults: [],
    createdAt: 0,
    updatedAt: 1_000,
    scoringPolicyVersion: SCRAMBLED_WORDS_SCORING_POLICY_VERSION,
    ...overrides,
  };
}

describe('splitWordIntoFragments', () => {
  it.each([
    'بحر',
    'كتاب',
    'استرخاء',
    'سياحة',
    'مستشفىالتعليميةطويلة',
  ])('keeps every letter of "%s" across fragments', (word) => {
    for (let seed = 0; seed < 25; seed += 1) {
      let counter = seed;
      const random = () => {
        counter = (counter * 9301 + 49297) % 233280;
        return counter / 233280;
      };
      const fragments = splitWordIntoFragments(word, random);
      expect(fragments.every((fragment) => fragment.length > 0)).toBe(true);
      expect(fragments.join('')).toBe(Array.from(word.replace(/\s+/g, '')).join(''));
      expect(fragments.length).toBeGreaterThanOrEqual(2);
      expect(fragments.length).toBeLessThanOrEqual(
        Math.min(Array.from(word).length, 5),
      );
    }
  });

  it('returns the trimmed word as a single fragment for one-letter words', () => {
    expect(splitWordIntoFragments(' ن ')).toEqual(['ن']);
  });

  it('splits deterministic words into 2 fragments when length is 3', () => {
    const fragments = splitWordIntoFragments('بحر', ZERO_RANDOM);
    expect(fragments.join('')).toBe('بحر');
    expect(fragments).toHaveLength(2);
  });
});

describe('shuffled', () => {
  it('preserves every element', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffled(items, ZERO_RANDOM);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate the source array', () => {
    const items = ['a', 'b', 'c'];
    shuffled(items);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('normalizeArabicWord', () => {
  it('unifies alef, teh marbuta, yeh and diacritics', () => {
    expect(normalizeArabicWord('أَمْواج')).toBe(normalizeArabicWord('امواج'));
    expect(normalizeArabicWord('شاطئ')).toBe(normalizeArabicWord('شاطي'));
    expect(normalizeArabicWord('مدرسة')).toBe(normalizeArabicWord('مدرسه'));
    expect(normalizeArabicWord('  بحر   ')).toBe('بحر');
  });

  it('marks solved words through normalization', () => {
    expect(isScrambledWordsWordSolved('أمواج', ['امواج'])).toBe(true);
    expect(isScrambledWordsWordSolved('بحر', ['امواج', 'شاطئ'])).toBe(false);
  });
});

describe('buildScrambledWordsRoomSnapshot', () => {
  it('hides other players words and exposes viewer progress', () => {
    const snapshot = buildScrambledWordsRoomSnapshot(makeRoom(), 'player-1', false, 1_000);
    expect(snapshot.mySolvedWords).toEqual(['بحر', 'امواج']);
    expect(snapshot.players[0]).toMatchObject({
      id: 'player-1',
      solvedCount: 2,
      wordCount: 3,
      isViewer: true,
    });
    expect(snapshot.players[1]).toMatchObject({
      id: 'player-2',
      solvedCount: 0,
      isViewer: false,
    });
    expect(snapshot.currentPuzzle).not.toHaveProperty('words');
    expect(snapshot.currentPuzzle?.wordLengths).toEqual([3, 5, 4]);
    expect(snapshot.remainingSeconds).toBe(60);
  });

  it('reports host identity and cleared puzzle for waiting rooms', () => {
    const snapshot = buildScrambledWordsRoomSnapshot(
      makeRoom({ status: 'waiting', currentPuzzle: null, currentFragments: null, puzzleDeadlineAt: null }),
      'host-1',
      true,
    );
    expect(snapshot.isHost).toBe(true);
    expect(snapshot.currentPuzzle).toBeNull();
    expect(snapshot.remainingSeconds).toBeNull();
    expect(SCRAMBLED_WORDS_POINTS_PER_WORD).toBe(1);
  });
});
