import type {
  CategoryBoardCategory,
  CategoryBoardQuestion,
} from '@/components/special-games/category-board-data';
import type { QuestionFeedRow } from '../types';

const BOARD_VALUES = [200, 400, 600] as const;
type BoardValue = (typeof BOARD_VALUES)[number];

function readBoardValue(row: QuestionFeedRow): BoardValue | null {
  const marker = row.keywords.find((keyword) => keyword.startsWith('قيمة:'));
  if (marker) {
    const parsed = Number.parseInt(marker.slice('قيمة:'.length).trim(), 10);
    if ((BOARD_VALUES as readonly number[]).includes(parsed)) return parsed as BoardValue;
  }
  if ((BOARD_VALUES as readonly number[]).includes(row.basePoints)) {
    return row.basePoints as BoardValue;
  }
  if (row.difficulty === 'EASY') return 200;
  if (row.difficulty === 'MEDIUM') return 400;
  return 600;
}

function slugifyCategory(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .slice(0, 48) || 'category';
}

export function adaptFeedToCategoryBoardLibrary(
  rows: readonly QuestionFeedRow[],
): CategoryBoardCategory[] {
  const groups = new Map<string, { title: string; questions: CategoryBoardQuestion[] }>();

  for (const row of rows) {
    const answer =
      row.expectedAnswer?.trim() ||
      row.options.find((option) => option.isCorrect)?.text.trim() ||
      '';
    if (!answer) continue;
    const value = readBoardValue(row);
    if (!value) continue;

    const title = row.categoryName.trim() || 'عام';
    const key = slugifyCategory(title);
    const question: CategoryBoardQuestion = {
      id: row.id,
      value,
      prompt: row.prompt,
      answer,
      note: row.explanation?.trim() || undefined,
    };
    const existing = groups.get(key);
    if (existing) {
      existing.questions.push(question);
    } else {
      groups.set(key, { title, questions: [question] });
    }
  }

  return [...groups.entries()].flatMap(([id, group]) => {
    const byValue = new Map<BoardValue, CategoryBoardQuestion[]>();
    for (const question of group.questions) {
      byValue.set(question.value, [...(byValue.get(question.value) ?? []), question]);
    }

    const balanced: CategoryBoardQuestion[] = [];
    for (const value of BOARD_VALUES) {
      balanced.push(...(byValue.get(value) ?? []).slice(0, 2));
    }
    if (balanced.length < 3) return [];

    return [
      {
        id,
        title: group.title,
        shortLabel: group.title.slice(0, 4),
        description: `أسئلة حزمة «${group.title}»`,
        questions: balanced,
      } satisfies CategoryBoardCategory,
    ];
  });
}
