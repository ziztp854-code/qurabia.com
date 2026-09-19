import { describe, expect, it } from 'vitest';
import {
  LOYALTY_HOSTED_SESSIONS,
  LOYALTY_REWARD_DAYS,
  LOYALTY_REWARD_PLAN,
  LOYALTY_WINDOW_DAYS,
  PLAN_CODES,
  flagFor,
  isPlanCode,
  limitFor,
  planDefinition,
} from './plans';

describe('plans', () => {
  it('ranks tiers in ascending privilege order', () => {
    expect(PLAN_CODES).toEqual(['SPECTATOR', 'KNIGHT', 'PRINCE', 'SULTAN']);
    const rooms = PLAN_CODES.map((code) => limitFor(code, 'maxRoomPlayers'));
    expect([...rooms].sort((a, b) => a - b)).toEqual(rooms);
    const questions = PLAN_CODES.map((code) => limitFor(code, 'maxQuestionsPerMonth'));
    expect([...questions].sort((a, b) => a - b)).toEqual(questions);
  });

  it('keeps the free tier usable but limited', () => {
    expect(limitFor('SPECTATOR', 'maxRoomPlayers')).toBeGreaterThan(1);
    expect(limitFor('SPECTATOR', 'aiQuestionsPerMonth')).toBeGreaterThan(0);
    expect(flagFor('SPECTATOR', 'deepReports')).toBe(false);
    expect(flagFor('SULTAN', 'earlyAccessGames')).toBe(true);
  });

  it('defines the loyalty reward from hosted sessions', () => {
    expect(LOYALTY_HOSTED_SESSIONS).toBeGreaterThanOrEqual(3);
    expect(LOYALTY_WINDOW_DAYS).toBeGreaterThanOrEqual(LOYALTY_REWARD_DAYS);
    expect(LOYALTY_REWARD_PLAN).toBe('KNIGHT');
    expect(LOYALTY_REWARD_DAYS).toBeLessThanOrEqual(planDefinition('KNIGHT').durationDays);
  });

  it('guards the plan code type', () => {
    expect(isPlanCode('KNIGHT')).toBe(true);
    expect(isPlanCode('EMPEROR')).toBe(false);
    expect(isPlanCode(null)).toBe(false);
  });
});
