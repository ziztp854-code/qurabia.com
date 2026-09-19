import {
  CANONICAL_CATEGORIES,
  listAllNamesForDomain,
  listCanonicalNamesForDomain,
  normalizeCategoryName,
  type CanonicalCategory,
} from './category-taxonomy';

export type MasterDomainId = CanonicalCategory['domainId'];

export type MasterDomain = {
  id: MasterDomainId;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  accentBg: string;
  description: string;
  /** Canonical subcategory labels shown in the domain catalog. */
  matchedCategories: readonly string[];
};

const domainMeta: Record<
  MasterDomainId,
  Omit<MasterDomain, 'id' | 'matchedCategories'>
> = {
  islamic: {
    name: 'ثقافة إسلامية ودين',
    shortName: 'الدين والشريعة',
    icon: '🕌',
    color: '#10b981',
    accentBg: 'rgba(16, 185, 129, 0.12)',
    description: 'القرآن الكريم، السيرة النبوية، الفقه، والتاريخ والعلوم الشرعية',
  },
  general: {
    name: 'ثقافة عامة ومعلومات',
    shortName: 'ثقافة عامة',
    icon: '💡',
    color: '#f59e0b',
    accentBg: 'rgba(245, 158, 11, 0.12)',
    description: 'المعرفة العامة، الثقافة المجتمعية، التقويم، ومعالم العالم',
  },
  geography: {
    name: 'جغرافيا وعوالم',
    shortName: 'الجغرافيا والخرائط',
    icon: '🌍',
    color: '#3b82f6',
    accentBg: 'rgba(59, 130, 246, 0.12)',
    description: 'الدول والعواصم، التضاريس، الجغرافيا العربية والسعودية والعالمية',
  },
  history: {
    name: 'تاريخ وحضارات',
    shortName: 'التاريخ والحضارات',
    icon: '🏛️',
    color: '#d97706',
    accentBg: 'rgba(217, 119, 6, 0.12)',
    description: 'التاريخ العربي والسعودي، الحضارات القديمة، المعارك والشخصيات البارزة',
  },
  science: {
    name: 'علوم وطبيعة',
    shortName: 'العلوم والطبيعة',
    icon: '🔬',
    color: '#06b6d4',
    accentBg: 'rgba(6, 182, 212, 0.12)',
    description: 'الفيزياء، الكيمياء، الأحياء، الفضاء والفلك، وعلوم الأرض والبيئة',
  },
  literature: {
    name: 'لغة وأدب وشعر',
    shortName: 'اللغة والأدب',
    icon: '📖',
    color: '#8b5cf6',
    accentBg: 'rgba(139, 92, 246, 0.12)',
    description: 'الأدب العربي، الشعر، النحو والبلاغة، المعاجم، وحروف الهجاء',
  },
  sports: {
    name: 'رياضة وبطولات',
    shortName: 'الرياضة والبطولات',
    icon: '⚽',
    color: '#ef4444',
    accentBg: 'rgba(239, 68, 68, 0.12)',
    description: 'كرة القدم، الألعاب الأولمبية، البطولات القارية، والأرقام القياسية',
  },
  logic: {
    name: 'رياضيات وتفكير منطقي',
    shortName: 'الرياضيات والمنطق',
    icon: '🧮',
    color: '#ec4899',
    accentBg: 'rgba(236, 72, 153, 0.12)',
    description: 'الحساب الذهني، الهندسة، الجبر، المتتابعات، والألغاز المنطقية',
  },
  tech: {
    name: 'تقنية وبرمجة',
    shortName: 'التقنية والبرمجة',
    icon: '💻',
    color: '#6366f1',
    accentBg: 'rgba(99, 102, 241, 0.12)',
    description: 'الذكاء الاصطناعي، الأمن الرقمي، البرمجة، قواعد البيانات، والشبكات',
  },
};

const domainOrder: MasterDomainId[] = [
  'islamic',
  'general',
  'geography',
  'history',
  'science',
  'literature',
  'sports',
  'logic',
  'tech',
];

export const MASTER_DOMAINS: readonly MasterDomain[] = domainOrder.map((id) => ({
  id,
  ...domainMeta[id],
  matchedCategories: listCanonicalNamesForDomain(id),
}));

const categoryToDomainMap = new Map<string, MasterDomain>();

for (const domain of MASTER_DOMAINS) {
  for (const catName of listAllNamesForDomain(domain.id)) {
    categoryToDomainMap.set(catName, domain);
  }
}

/**
 * Returns the MasterDomain matching the given category name.
 * Falls back to 'general' domain if unmapped.
 */
export function getMasterDomainForCategory(categoryName: string | null | undefined): MasterDomain {
  if (!categoryName) {
    return MASTER_DOMAINS[1]; // General culture fallback
  }

  const trimmed = categoryName.trim();
  const canonical = normalizeCategoryName(trimmed) ?? trimmed;

  const byCanonical = categoryToDomainMap.get(canonical) ?? categoryToDomainMap.get(trimmed);
  if (byCanonical) return byCanonical;

  const normalized = canonical.toLowerCase();
  for (const domain of MASTER_DOMAINS) {
    for (const cat of domain.matchedCategories) {
      if (normalized.includes(cat.toLowerCase()) || cat.toLowerCase().includes(normalized)) {
        return domain;
      }
    }
  }

  return MASTER_DOMAINS[1];
}

export type CategoryStat = {
  id: string;
  name: string;
  questionCount: number;
  /** Name after alias normalization (may equal `name`). */
  canonicalName: string;
};

export type MasterDomainAggregation = {
  domain: MasterDomain;
  totalQuestions: number;
  categories: CategoryStat[];
};

/**
 * Aggregates category stats into the 9 Master Domains.
 * Alias categories are rolled into their canonical bucket when counting.
 */
export function aggregateCategoriesIntoDomains(
  categories: Array<{ id: string; name: string; _count?: { questions: number } }>,
): MasterDomainAggregation[] {
  const domainMap = new Map<
    MasterDomainId,
    { domain: MasterDomain; totalQuestions: number; categories: CategoryStat[]; byCanonical: Map<string, CategoryStat> }
  >();

  for (const domain of MASTER_DOMAINS) {
    domainMap.set(domain.id, {
      domain,
      totalQuestions: 0,
      categories: [],
      byCanonical: new Map(),
    });
  }

  for (const cat of categories) {
    const count = cat._count?.questions ?? 0;
    const canonicalName = normalizeCategoryName(cat.name) ?? cat.name;
    const master = getMasterDomainForCategory(cat.name);
    const agg = domainMap.get(master.id);
    if (!agg) continue;

    agg.totalQuestions += count;

    const existing = agg.byCanonical.get(canonicalName);
    if (existing) {
      existing.questionCount += count;
    } else {
      agg.byCanonical.set(canonicalName, {
        id: cat.id,
        name: canonicalName,
        canonicalName,
        questionCount: count,
      });
    }
  }

  return Array.from(domainMap.values()).map(({ domain, totalQuestions, byCanonical }) => ({
    domain,
    totalQuestions,
    categories: Array.from(byCanonical.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ar'),
    ),
  }));
}

export type CanonicalQuestionGroup<T extends { category?: { name?: string | null } | null }> = {
  canonicalName: string;
  domain: MasterDomain;
  questions: T[];
};

export function groupQuestionsByCanonicalCategory<
  T extends { category?: { name?: string | null } | null },
>(questions: T[]): CanonicalQuestionGroup<T>[] {
  const groups = new Map<string, CanonicalQuestionGroup<T>>();

  for (const question of questions) {
    const canonicalName = normalizeCategoryName(question.category?.name) ?? question.category?.name ?? 'عام';
    const domain = getMasterDomainForCategory(canonicalName);
    const existing = groups.get(canonicalName);
    if (existing) {
      existing.questions.push(question);
    } else {
      groups.set(canonicalName, { canonicalName, domain, questions: [question] });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const domainDelta =
      MASTER_DOMAINS.findIndex((d) => d.id === a.domain.id) -
      MASTER_DOMAINS.findIndex((d) => d.id === b.domain.id);
    if (domainDelta !== 0) return domainDelta;
    return a.canonicalName.localeCompare(b.canonicalName, 'ar');
  });
}

export type CanonicalFilterOption = {
  name: string;
  count: number;
  domainId: MasterDomainId;
};

/** Unique canonical labels with rolled-up counts, ordered by domain then size. */
export function listCanonicalFilterOptions(
  categories: Array<{ id: string; name: string; _count?: { questions: number } }>,
): CanonicalFilterOption[] {
  const byName = new Map<string, CanonicalFilterOption>();

  for (const category of categories) {
    const name = normalizeCategoryName(category.name) ?? category.name;
    const domain = getMasterDomainForCategory(name);
    const count = category._count?.questions ?? 0;
    const existing = byName.get(name);
    if (existing) {
      existing.count += count;
    } else {
      byName.set(name, { name, count, domainId: domain.id });
    }
  }

  return Array.from(byName.values()).sort((a, b) => {
    const domainDelta =
      MASTER_DOMAINS.findIndex((d) => d.id === a.domainId) -
      MASTER_DOMAINS.findIndex((d) => d.id === b.domainId);
    if (domainDelta !== 0) return domainDelta;
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, 'ar');
  });
}

export { normalizeCategoryName, CANONICAL_CATEGORIES };
