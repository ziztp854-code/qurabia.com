import {
  MILLIONAIRE_LEVELS,
  type MillionaireQuestion,
} from '@/components/special-games/millionaire-bank';
import type { QuestionFeedRow } from '../types';

function levelFromRow(row: QuestionFeedRow): number | null {
  const pointsMarker = row.keywords.find((keyword) => keyword.startsWith('مستوى:'));
  if (pointsMarker) {
    const parsed = Number.parseInt(pointsMarker.slice('مستوى:'.length).trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 15) return parsed;
  }

  const valueIndex = MILLIONAIRE_LEVELS.indexOf(row.basePoints as (typeof MILLIONAIRE_LEVELS)[number]);
  if (valueIndex >= 0) return valueIndex + 1;

  if (row.difficulty === 'EASY') return Math.min(5, Math.max(1, Math.ceil(row.basePoints / 200) || 1));
  if (row.difficulty === 'MEDIUM') return Math.min(10, Math.max(6, Math.ceil(row.basePoints / 3_000) || 6));
  return Math.min(15, Math.max(11, Math.ceil(row.basePoints / 50_000) || 11));
}

function toAnswerIndex(options: QuestionFeedRow['options']): 0 | 1 | 2 | 3 | null {
  const correct = options.findIndex((option) => option.isCorrect);
  if (correct < 0 || correct > 3) return null;
  return correct as 0 | 1 | 2 | 3;
}

export function adaptFeedToMillionaireQuestions(
  rows: readonly QuestionFeedRow[],
): MillionaireQuestion[] {
  return rows.flatMap((row) => {
    if (row.type !== 'MULTIPLE_CHOICE' && row.type !== 'TRUE_FALSE') return [];
    const texts = row.options.map((option) => option.text.trim()).filter(Boolean);
    if (texts.length < 4) return [];
    const answerIndex = toAnswerIndex(row.options);
    if (answerIndex === null) return [];
    const level = levelFromRow(row);
    if (!level) return [];
    const value = MILLIONAIRE_LEVELS[level - 1];
    if (!value) return [];

    return [
      {
        id: row.id,
        level,
        value,
        category: row.categoryName,
        prompt: row.prompt,
        options: [texts[0]!, texts[1]!, texts[2]!, texts[3]!] as [
          string,
          string,
          string,
          string,
        ],
        answerIndex,
        explanation: row.explanation?.trim() || 'إجابة الحزمة المحفوظة.',
      },
    ];
  });
}

export function buildMillionaireRunFromFeed(
  rows: readonly QuestionFeedRow[],
  seed = 0,
  fallback: MillionaireQuestion[] = [],
): MillionaireQuestion[] {
  const adapted = adaptFeedToMillionaireQuestions(rows);
  const byLevel = new Map<number, MillionaireQuestion[]>();
  for (const question of [...adapted, ...fallback]) {
    byLevel.set(question.level, [...(byLevel.get(question.level) ?? []), question]);
  }

  return MILLIONAIRE_LEVELS.flatMap((value, index) => {
    const level = index + 1;
    const pool = byLevel.get(level) ?? [];
    if (pool.length === 0) return [];
    const question = pool[Math.abs(seed + index) % pool.length];
    return question && question.value === value ? [question] : [];
  });
}
