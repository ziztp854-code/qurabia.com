import { describe, expect, it } from 'vitest';
import {
  isSpecialGameMode,
  PARALLEL_WORLD_BANK,
  REVERSE_TIME_BANK,
  SPECIAL_GAME_META,
  SPECIAL_GAME_ORDER,
  SPECTRUM_BANK,
  UPCOMING_SPECIAL_GAMES,
} from '@tahaddi/domain';
import {
  COLOR_RUSH_BANK,
  INSTANT_GAME_META,
  INSTANT_GAME_ORDER,
  isInstantGameMode,
  MEMORY_SYMBOL_BANK,
  QUESTION_WORD_BANK,
  WORD_CODE_BANK,
} from '../instant-games/game-data';
import { generateStaticParams } from '@/app/games/[mode]/page';

describe('game catalog sources', () => {
  it('keeps every published mode complete and accepted by its guard', () => {
    for (const mode of SPECIAL_GAME_ORDER) {
      expect(isSpecialGameMode(mode)).toBe(true);
      expect(SPECIAL_GAME_META[mode]).toEqual(
        expect.objectContaining({
          mode,
          title: expect.any(String),
          description: expect.any(String),
          minimumPlayers: expect.any(Number),
          roundSeconds: expect.any(Number),
          contentLabel: expect.any(String),
        }),
      );
    }

    for (const mode of INSTANT_GAME_ORDER) {
      expect(isInstantGameMode(mode)).toBe(true);
      expect(INSTANT_GAME_META[mode]).toEqual(
        expect.objectContaining({
          mode,
          title: expect.any(String),
          description: expect.any(String),
          minimumPlayers: expect.any(Number),
          roundSeconds: expect.any(Number),
          contentLabel: expect.any(String),
        }),
      );
    }
  });

  it('keeps upcoming slugs unpublished and fully described', () => {
    for (const game of UPCOMING_SPECIAL_GAMES) {
      expect(isSpecialGameMode(game.slug)).toBe(false);
      expect(isInstantGameMode(game.slug)).toBe(false);
      expect(game).toEqual(
        expect.objectContaining({
          title: expect.any(String),
          description: expect.any(String),
          minimumPlayers: expect.any(Number),
          roundSeconds: expect.any(Number),
          contentLabel: expect.any(String),
        }),
      );
    }
  });

  it('includes every published mode and no upcoming slug in static params', () => {
    const params = generateStaticParams().map(({ mode }) => mode);
    expect(params).toEqual([...SPECIAL_GAME_ORDER, ...INSTANT_GAME_ORDER]);
    for (const game of UPCOMING_SPECIAL_GAMES) {
      expect(params).not.toContain(game.slug);
    }
  });
});

describe('game content banks', () => {
  it('keeps parallel rounds unique with a fixed option count and answer in every variant', () => {
    const ids = PARALLEL_WORLD_BANK.map((round) => round.id);
    const optionCount = PARALLEL_WORLD_BANK[0]?.variants[0]?.options.length;
    expect(new Set(ids).size).toBe(ids.length);
    expect(optionCount).toBeGreaterThan(1);

    for (const round of PARALLEL_WORLD_BANK) {
      expect(round.variants.length).toBeGreaterThanOrEqual(4);
      for (const variant of round.variants) {
        expect(variant.options).toHaveLength(optionCount ?? 0);
        expect(variant.options).toContain(round.answer);
      }
    }
  });

  it('keeps reverse, spectrum, and instant banks non-empty and unique', () => {
    expect(new Set(REVERSE_TIME_BANK.map((round) => round.id)).size).toBe(REVERSE_TIME_BANK.length);
    expect(SPECTRUM_BANK.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SPECTRUM_BANK.map((pair) => pair.id)).size).toBe(SPECTRUM_BANK.length);
    for (const pair of SPECTRUM_BANK) {
      expect(pair.left.trim()).not.toBe('');
      expect(pair.right.trim()).not.toBe('');
      expect(pair.category.trim()).not.toBe('');
      expect(pair.left).not.toBe(pair.right);
    }

    expect(new Set(MEMORY_SYMBOL_BANK.map((item) => item.label)).size).toBe(
      MEMORY_SYMBOL_BANK.length,
    );
    expect(new Set(WORD_CODE_BANK.map((item) => item.word)).size).toBe(WORD_CODE_BANK.length);
    expect(new Set(QUESTION_WORD_BANK.map((item) => item.answer)).size).toBe(
      QUESTION_WORD_BANK.length,
    );
    expect(new Set(COLOR_RUSH_BANK.map((item) => item.value)).size).toBe(COLOR_RUSH_BANK.length);
  });
});
