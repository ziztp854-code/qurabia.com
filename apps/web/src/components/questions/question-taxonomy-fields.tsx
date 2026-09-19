import { isCanonicalCategory, normalizeCategoryName } from '@/lib/questions/category-taxonomy';

type CategoryOption = { id: string; name: string };

const gameOptions = [
  { value: 'QUIZ', label: 'المسابقات' },
  { value: 'LADDER', label: 'لعبة السلم' },
  { value: 'CATEGORY_BOARD', label: 'لوحة الفئات' },
  { value: 'LETTER_CHALLENGE', label: 'تحدي الحروف' },
  { value: 'MILLIONAIRE', label: 'من سيربح المليون' },
  { value: 'QUESTION_WORD', label: 'كلمة وسؤال' },
] as const;

export type QuestionGameValue = (typeof gameOptions)[number]['value'];

function uniqueCanonicalOptions(categories: CategoryOption[]): CategoryOption[] {
  const preferred = new Map<string, CategoryOption>();

  const ranked = [...categories].sort((a, b) => {
    const aCanon = isCanonicalCategory(a.name) ? 0 : 1;
    const bCanon = isCanonicalCategory(b.name) ? 0 : 1;
    if (aCanon !== bCanon) return aCanon - bCanon;
    return a.name.localeCompare(b.name, 'ar');
  });

  for (const category of ranked) {
    const canonical = normalizeCategoryName(category.name) ?? category.name;
    if (!preferred.has(canonical)) {
      preferred.set(canonical, { id: category.id, name: canonical });
    }
  }

  return Array.from(preferred.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export function QuestionTaxonomyFields({
  categories,
  categoryId,
  gameTypes = ['QUIZ', 'LADDER'],
  onCategoryChange,
}: {
  categories: CategoryOption[];
  categoryId?: string | null;
  gameTypes?: readonly QuestionGameValue[];
  onCategoryChange?: (categoryId: string) => void;
}) {
  const ordered = uniqueCanonicalOptions(categories);

  return (
    <>
      <label className="field">
        <span className="field-label">التصنيف</span>
        <select
          name="categoryId"
          {...(onCategoryChange
            ? {
                value: categoryId || '',
                onChange: (event) => onCategoryChange(event.target.value),
              }
            : { defaultValue: categoryId || '' })}
        >
          <option value="">بدون تصنيف</option>
          {ordered.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="field question-games">
        <legend className="field-label">مناسبة للألعاب</legend>
        <div className="question-game-options">
          {gameOptions.map((game) => (
            <label key={game.value}>
              <input
                type="checkbox"
                name="gameTypes"
                value={game.value}
                defaultChecked={gameTypes.includes(game.value)}
              />
              <span>{game.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
