import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeTowerRun,
  KNOWLEDGE_TOWER_BANK,
  KNOWLEDGE_TOWER_FLOORS,
  getTowerDifficulty,
} from './knowledge-tower-bank';

describe('knowledge tower bank', () => {
  it('covers twelve climbable floors with unique valid questions', () => {
    expect(KNOWLEDGE_TOWER_BANK.length).toBeGreaterThanOrEqual(KNOWLEDGE_TOWER_FLOORS);
    expect(new Set(KNOWLEDGE_TOWER_BANK.map((question) => question.id)).size).toBe(
      KNOWLEDGE_TOWER_BANK.length,
    );
    for (const question of KNOWLEDGE_TOWER_BANK) {
      expect(question.options).toHaveLength(4);
      expect(question.options[question.answerIndex]).toBeTruthy();
      expect(question.prompt.length).toBeGreaterThan(8);
    }
  });

  it('builds a twelve-floor run matching the expected difficulty curve', () => {
    const run = buildKnowledgeTowerRun();
    expect(run).toHaveLength(12);
    expect(new Set(run.map((question) => question.id)).size).toBe(12);
    expect(getTowerDifficulty(1)).toBe('EASY');
    expect(getTowerDifficulty(6)).toBe('MEDIUM');
    expect(getTowerDifficulty(12)).toBe('HARD');
  });
});
