/**
 * Canonical category taxonomy for the Arabic question bank.
 * Aliases, Arabic folding, and keyword rules collapse fragmented names
 * into a stable set used by the bank index, editor, and merge script.
 */

export type CanonicalCategory = {
  name: string;
  domainId:
    | 'islamic'
    | 'general'
    | 'geography'
    | 'history'
    | 'science'
    | 'literature'
    | 'sports'
    | 'logic'
    | 'tech';
  description: string;
};

/** Preferred category names shown in editors and domain chips. */
export const CANONICAL_CATEGORIES: readonly CanonicalCategory[] = [
  {
    name: 'ثقافة إسلامية',
    domainId: 'islamic',
    description: 'عقيدة، فقه، قرآن، وسيرة',
  },
  {
    name: 'تاريخ إسلامي',
    domainId: 'islamic',
    description: 'الخلافة، الغزوات، والحضارة الإسلامية',
  },
  {
    name: 'ثقافة عامة',
    domainId: 'general',
    description: 'معرفة عامة ومعالم وتقويم',
  },
  {
    name: 'جغرافيا',
    domainId: 'geography',
    description: 'دول وعواصم وتضاريس',
  },
  {
    name: 'تاريخ',
    domainId: 'history',
    description: 'تاريخ عربي وعالمي وحضارات',
  },
  {
    name: 'تاريخ السعودية',
    domainId: 'history',
    description: 'تاريخ المملكة والدولة السعودية',
  },
  {
    name: 'علوم',
    domainId: 'science',
    description: 'فيزياء وكيمياء وأحياء وفضاء',
  },
  {
    name: 'أدب ولغة',
    domainId: 'literature',
    description: 'أدب عربي، نحو، بلاغة، ومفردات',
  },
  {
    name: 'رياضة',
    domainId: 'sports',
    description: 'كرة قدم وألعاب وبطولات',
  },
  {
    name: 'رياضيات',
    domainId: 'logic',
    description: 'حساب وهندسة وجبر ومتتابعات',
  },
  {
    name: 'منطق',
    domainId: 'logic',
    description: 'ألغاز وتفكير منطقي',
  },
  {
    name: 'تقنية',
    domainId: 'tech',
    description: 'برمجة وشبكات وقواعد بيانات',
  },
  {
    name: 'ذكاء اصطناعي',
    domainId: 'tech',
    description: 'تعلم آلة وذكاء اصطناعي',
  },
  {
    name: 'أمن رقمي',
    domainId: 'tech',
    description: 'أمن معلومات وحماية رقمية',
  },
] as const;

/**
 * Map legacy / synonym category names → canonical name.
 * Keys should be the trimmed names as stored in Category.name.
 */
export const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  // Islamic
  'تاريخ إسلامي': 'تاريخ إسلامي',
  'ثقافة إسلامية': 'ثقافة إسلامية',
  قرآن: 'ثقافة إسلامية',
  'علوم القرآن': 'ثقافة إسلامية',
  فقه: 'ثقافة إسلامية',
  سيرة: 'ثقافة إسلامية',
  'السيرة النبوية': 'ثقافة إسلامية',
  حديث: 'ثقافة إسلامية',
  عقيدة: 'ثقافة إسلامية',
  تفسير: 'ثقافة إسلامية',
  تجويد: 'ثقافة إسلامية',
  'علوم شرعية': 'ثقافة إسلامية',
  غزوات: 'تاريخ إسلامي',
  الخلافة: 'تاريخ إسلامي',
  'الدولة العباسية': 'تاريخ إسلامي',
  'الدولة الأموية': 'تاريخ إسلامي',
  الأندلس: 'تاريخ إسلامي',

  // General
  'ثقافة عامة': 'ثقافة عامة',
  'معلومات عامة': 'ثقافة عامة',
  'معرفة عامة': 'ثقافة عامة',
  تقويم: 'ثقافة عامة',
  'معالم عالمية': 'ثقافة عامة',
  'صح وخطأ': 'ثقافة عامة',
  'اختبار مؤقت': 'ثقافة عامة',
  عام: 'ثقافة عامة',
  متنوعة: 'ثقافة عامة',

  // Geography
  جغرافيا: 'جغرافيا',
  'جغرافيا عربية': 'جغرافيا',
  'جغرافيا السعودية': 'جغرافيا',
  'جغرافيا عالمية': 'جغرافيا',
  'السعودية والخليج والعالم العربي': 'جغرافيا',
  عواصم: 'جغرافيا',
  دول: 'جغرافيا',
  خرائط: 'جغرافيا',

  // History / Saudi
  تاريخ: 'تاريخ',
  'تاريخ عالمي': 'تاريخ',
  'تاريخ العلوم': 'تاريخ',
  'تاريخ المعرفة': 'تاريخ',
  'تاريخ وجغرافيا': 'تاريخ',
  'تاريخ وثقافة': 'تاريخ',
  حضارات: 'تاريخ',
  'تاريخ السعودية': 'تاريخ السعودية',
  السعودية: 'تاريخ السعودية',
  'المملكة العربية السعودية': 'تاريخ السعودية',
  'تاريخ المملكة': 'تاريخ السعودية',

  // Science
  علوم: 'علوم',
  فيزياء: 'علوم',
  كيمياء: 'علوم',
  أحياء: 'علوم',
  فضاء: 'علوم',
  فلك: 'علوم',
  'علوم الأرض': 'علوم',
  بيئة: 'علوم',
  طبيعة: 'علوم',

  // Literature
  'أدب ولغة': 'أدب ولغة',
  أدب: 'أدب ولغة',
  'أدب عربي': 'أدب ولغة',
  لغة: 'أدب ولغة',
  'لغة عربية': 'أدب ولغة',
  'لغة وثقافة': 'أدب ولغة',
  نحو: 'أدب ولغة',
  بلاغة: 'أدب ولغة',
  شعر: 'أدب ولغة',
  'مفردات عربية': 'أدب ولغة',
  'حروف عربية': 'أدب ولغة',

  // Sports
  رياضة: 'رياضة',
  'كرة القدم': 'رياضة',
  أولمبياد: 'رياضة',
  بطولات: 'رياضة',

  // Logic / math
  رياضيات: 'رياضيات',
  'حساب ذهني': 'رياضيات',
  'جبر بسيط': 'رياضيات',
  هندسة: 'رياضيات',
  متتابعات: 'رياضيات',
  'منطق ورياضيات': 'رياضيات',
  منطق: 'منطق',
  'منطق ترتيبي': 'منطق',
  ألغاز: 'منطق',

  // Tech
  تقنية: 'تقنية',
  تكنولوجيا: 'تقنية',
  حاسوب: 'تقنية',
  برمجة: 'تقنية',
  'تقنية وأمن': 'أمن رقمي',
  'هندسة برمجيات': 'تقنية',
  'قواعد بيانات': 'تقنية',
  شبكات: 'تقنية',
  'ذكاء اصطناعي': 'ذكاء اصطناعي',
  'تعلم آلة': 'ذكاء اصطناعي',
  'أمن رقمي': 'أمن رقمي',
  'أمن سيبراني': 'أمن رقمي',
  'أمن المعلومات': 'أمن رقمي',
};

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** Collapse diacritics, alef variants, and punctuation for matching. */
export function foldArabicLabel(value: string): string {
  return value
    .normalize('NFKC')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripLeadingAl(folded: string): string {
  return folded.startsWith('ال') && folded.length > 3 ? folded.slice(2) : folded;
}

export function foldArabicKey(value: string): string {
  return stripLeadingAl(foldArabicLabel(value));
}

/** Specific-first keyword rules for names that never hit an exact alias. */
const CATEGORY_KEYWORD_RULES: ReadonlyArray<{ to: string; needles: string[] }> = [
  { to: 'تاريخ إسلامي', needles: ['تاريخ اسلامي', 'غزوه', 'خلافه', 'عباسي', 'اموي', 'عثماني', 'اندلس', 'راشدين'] },
  { to: 'ثقافة إسلامية', needles: ['قران', 'فقه', 'سيره', 'حديث', 'عقيده', 'شريعه', 'شرعيه', 'تفسير', 'تجويد', 'اسلام'] },
  { to: 'تاريخ السعودية', needles: ['سعود', 'درعيه', 'يوم التاسيس', 'المملكه'] },
  { to: 'جغرافيا', needles: ['جغراف', 'عواصم', 'قارات', 'محيطات', 'تضاريس', 'خرائط'] },
  { to: 'أدب ولغة', needles: ['ادب', 'شعر', 'نحو', 'بلاغه', 'قصيده', 'معجم', 'لغه عربي'] },
  { to: 'علوم', needles: ['فيزياء', 'كيمياء', 'احياء', 'فلك', 'فضاء', 'بيولوجي', 'بيئه'] },
  { to: 'رياضيات', needles: ['رياضيات', 'جبر', 'حساب ذهني', 'متتابعه'] },
  { to: 'رياضة', needles: ['رياضه', 'رياضي', 'كره قدم', 'اولمبي', 'فيفا', 'بطوله'] },
  { to: 'ذكاء اصطناعي', needles: ['ذكاء اصطناعي', 'تعلم اله', 'شبكه عصبيه'] },
  { to: 'أمن رقمي', needles: ['امن رقمي', 'امن معلومات', 'سيبراني'] },
  { to: 'تقنية', needles: ['برمجه', 'تقنيه', 'تكنولوجيا', 'قواعد بيانات', 'شبكات', 'حاسوب', 'هندسه برمج'] },
  { to: 'منطق', needles: ['منطق', 'لغز', 'الغاز'] },
  { to: 'تاريخ', needles: ['تاريخ', 'حضار', 'فرعون', 'معركه'] },
  { to: 'ثقافة عامة', needles: ['ثقافه عامه', 'معلومات عامه', 'تقويم', 'معالم'] },
];

const foldedKeywordRules = CATEGORY_KEYWORD_RULES.map((rule) => ({
  to: rule.to,
  needles: rule.needles.map((needle) => foldArabicLabel(needle)),
}));

const aliasLookup = new Map(
  Object.entries(CATEGORY_ALIASES).map(([from, to]) => [from.trim(), to]),
);

const foldedLookup = new Map<string, string>();

function rememberFold(from: string, to: string) {
  const folded = foldArabicLabel(from);
  const key = foldArabicKey(from);
  if (folded && !foldedLookup.has(folded)) foldedLookup.set(folded, to);
  if (key && !foldedLookup.has(key)) foldedLookup.set(key, to);
}

for (const category of CANONICAL_CATEGORIES) {
  rememberFold(category.name, category.name);
}
for (const [from, to] of Object.entries(CATEGORY_ALIASES)) {
  rememberFold(from, to);
}

const canonicalNames = new Set(CANONICAL_CATEGORIES.map((c) => c.name));

function matchByKeywords(folded: string): string | null {
  const parts = folded.split(' ').filter(Boolean);

  for (const rule of foldedKeywordRules) {
    const matched = rule.needles.some((needle) => {
      if (needle.includes(' ')) return folded.includes(needle);
      return parts.some((part) => part === needle || part.startsWith(needle));
    });
    if (matched) return rule.to;
  }
  return null;
}

/** Normalize a raw category label to its canonical name (or trimmed original). */
export function normalizeCategoryName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exact = aliasLookup.get(trimmed);
  if (exact) return exact;

  const folded = foldArabicLabel(trimmed);
  const foldedHit = foldedLookup.get(folded) ?? foldedLookup.get(foldArabicKey(trimmed));
  if (foldedHit) return foldedHit;

  const keywordHit = matchByKeywords(folded);
  if (keywordHit) return keywordHit;

  return trimmed;
}

export function isCanonicalCategory(name: string): boolean {
  const canonical = normalizeCategoryName(name);
  return Boolean(canonical && canonicalNames.has(canonical) && canonical === name.trim());
}

export function listCanonicalNamesForDomain(domainId: CanonicalCategory['domainId']): string[] {
  return CANONICAL_CATEGORIES.filter((c) => c.domainId === domainId).map((c) => c.name);
}

/** All names (canonical + aliases) that belong under a domain after normalization. */
export function listAllNamesForDomain(domainId: CanonicalCategory['domainId']): string[] {
  const canonical = new Set(listCanonicalNamesForDomain(domainId));
  const names = new Set<string>(canonical);
  for (const [alias, target] of Object.entries(CATEGORY_ALIASES)) {
    if (canonical.has(target)) names.add(alias);
  }
  return Array.from(names);
}

export type CategoryMergePlan = {
  from: string;
  to: string;
};

/** Build merge pairs for non-canonical aliases that differ from their target. */
export function buildCategoryMergePlan(existingNames: string[]): CategoryMergePlan[] {
  const plans: CategoryMergePlan[] = [];
  const seen = new Set<string>();

  for (const raw of existingNames) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const canonical = normalizeCategoryName(name);
    if (canonical && canonical !== name) {
      plans.push({ from: name, to: canonical });
    }
  }

  return plans.sort((a, b) => a.from.localeCompare(b.from, 'ar'));
}
