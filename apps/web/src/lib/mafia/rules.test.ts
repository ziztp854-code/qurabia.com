import { describe, expect, it } from 'vitest';
import { buildMafiaRoles, determineMafiaWinner, resolveMafiaChatChannel, shuffled } from './rules';

describe('mafia rules', () => {
  it('creates balanced roles and preserves the player count', () => {
    const roles = buildMafiaRoles(8, 2);
    expect(roles).toHaveLength(8);
    expect(roles.filter((role) => role === 'KILLER')).toHaveLength(2);
    expect(roles).toEqual(expect.arrayContaining(['DETECTIVE', 'DOCTOR', 'GUARD', 'WITNESS']));
  });

  it('detects both winning sides', () => {
    expect(determineMafiaWinner(['DETECTIVE', 'CITIZEN'])).toBe('CITIZENS');
    expect(determineMafiaWinner(['KILLER', 'CITIZEN'])).toBe('KILLERS');
    expect(determineMafiaWinner(['KILLER', 'CITIZEN', 'DOCTOR'])).toBeNull();
  });

  it('supports deterministic shuffling for tests', () => {
    expect(shuffled([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });

  it('keeps night chat secret and gives eliminated players a ghost channel', () => {
    expect(
      resolveMafiaChatChannel({
        gameStatus: 'NIGHT',
        role: 'KILLER',
        playerStatus: 'ALIVE',
      }),
    ).toBe('KILLERS');
    expect(
      resolveMafiaChatChannel({
        gameStatus: 'NIGHT',
        role: 'CITIZEN',
        playerStatus: 'ALIVE',
      }),
    ).toBeNull();
    expect(
      resolveMafiaChatChannel({
        gameStatus: 'DAY',
        role: 'CITIZEN',
        playerStatus: 'ELIMINATED',
      }),
    ).toBe('GHOSTS');
  });
});
