/**
 * organize-question-bank.ts
 * ---------------------------------------------------------------------------
 * Ad-hoc migration script that turns the flat question-bank category list
 * into a two-level hierarchy (Domain → Canonical Category), backfills the
 * new metadata fields (slug, parentId, isActive, position, icon,
 * description, expectedAnswer, keywords, version, lastEditedAt), and
 * prints a summary report.
 *
 * The script is intentionally idempotent so it can be re-run safely:
 *   - Canonical categories are upserted by name.
 *   - Domain parents are created once and looked up by name on each run.
 *   - Re-parenting only happens when the recorded parentId is wrong.
 *   - Question keywords are merged (set union), never wiped.
 *
 * Usage:
 *   pnpm db:organize-questions
 *   pnpm db:organize-questions --dry-run
 *   pnpm db:organize-questions --only=categories,keywords
 */

import { config } from 'dotenv';
import { createPrismaClient, Prisma } from '@tahaddi/database';
import {
  CANONICAL_CATEGORIES,
  buildCategoryMergePlan,
  normalizeCategoryName,
  type CanonicalCategory,
} from '../apps/web/src/lib/questions/category-taxonomy';
import { MASTER_DOMAINS } from '../apps/web/src/lib/questions/bank-index';
import {
  foldKeyword,
  normalizeKeywords,
  MAX_KEYWORDS_PER_QUESTION,
} from '../apps/web/src/lib/questions/keywords';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
  config({ path: '.env.example', quiet: true });
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DIRECT_URL or DATABASE_URL is required to organize the question bank.');
  process.exit(1);
}

const prisma = createPrismaClient(connectionString);

const argv = process.argv.slice(2).flatMap((arg) => arg.split(','));
const dryRun = argv.includes('--dry-run');
const onlyFlag = argv.find((arg) => arg.startsWith('--only='));
const onlyPhases = new Set(
  onlyFlag
    ? onlyFlag
        .slice('--only='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : argv.includes('--only')
      ? argv.filter((arg) => !arg.startsWith('--'))
      : [],
);
const shouldRunPhase = (phase: string) =>
  onlyPhases.size === 0 || onlyPhases.has(phase);

const DOMAIN_PARENT_ICON = {
  islamic: '🕌',
  general: '💡',
  geography: '🌍',
  history: '🏛️',
  science: '🔬',
  literature: '📖',
  sports: '⚽',
  logic: '🧮',
  tech: '💻',
} as const;

const DOMAIN_TO_CANONICAL = new Map<string, CanonicalCategory['domainId']>();
for (const category of CANONICAL_CATEGORIES) {
  DOMAIN_TO_CANONICAL.set(category.name, category.domainId);
}

function slugify(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function domainParentName(domainId: CanonicalCategory['domainId']): string {
  return MASTER_DOMAINS.find((domain) => domain.id === domainId)?.name ?? domainId;
}

function questionAutoKeywords(prompt: string, categoryName: string | null): string[] {
  const candidates: string[] = [];
  if (categoryName) candidates.push(categoryName);
  // Break the prompt into short word tokens; Arabic folding is applied
  // inside normalizeKeywords so diacritics / alef variants collapse.
  const tokens = prompt
    .split(/[\s,،.!?؛:«»()\[\]"]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 40);
  candidates.push(...tokens.slice(0, 8));
  return normalizeKeywords(candidates)
    .slice(0, MAX_KEYWORDS_PER_QUESTION)
    .map((entry) => entry.raw);
}

type CategoryRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  position: number;
  isActive: boolean;
  parentId: string | null;
};

type CategoryStats = {
  createdDomains: number;
  createdCanonicals: number;
  reparented: number;
  merged: number;
  skipped: number;
  questionsMoved: number;
};

async function loadCategories(): Promise<CategoryRow[]> {
  const rows = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      position: true,
      isActive: true,
      parentId: true,
    },
    orderBy: [{ name: 'asc' }],
  });
  return rows;
}

async function ensureDomainParents(
  byName: Map<string, CategoryRow>,
): Promise<{ id: string; name: string }[]> {
  const created: { id: string; name: string }[] = [];
  for (const domain of MASTER_DOMAINS) {
    if (byName.has(domain.name)) continue;
    if (dryRun) {
      created.push({ id: `dry:${domain.id}`, name: domain.name });
      continue;
    }
    const row = await prisma.category.create({
      data: {
        name: domain.name,
        slug: slugify(domain.id),
        description: domain.description,
        icon: DOMAIN_PARENT_ICON[domain.id] ?? '📚',
        position: MASTER_DOMAINS.findIndex((d) => d.id === domain.id),
        isActive: true,
      },
      select: { id: true, name: true },
    });
    created.push(row);
  }
  return created;
}

async function ensureCanonicalCategory(
  canonical: CanonicalCategory,
  parentId: string,
  usedSlugs: Set<string>,
): Promise<CategoryRow> {
  const desiredSlug = slugify(canonical.name);
  let slug = desiredSlug;
  let suffix = 2;
  while (usedSlugs.has(slug)) {
    slug = `${desiredSlug}-${suffix}`;
    suffix += 1;
  }
  usedSlugs.add(slug);

  const existing = await prisma.category.findUnique({
    where: { name: canonical.name },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      position: true,
      isActive: true,
      parentId: true,
    },
  });

  if (!existing) {
    if (dryRun) {
      return {
        id: `dry:${canonical.name}`,
        name: canonical.name,
        slug,
        description: canonical.description,
        icon: '📘',
        position: 0,
        isActive: true,
        parentId,
      };
    }
    const row = await prisma.category.create({
      data: {
        name: canonical.name,
        slug,
        description: canonical.description,
        icon: '📘',
        position: 0,
        isActive: true,
        parentId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        position: true,
        isActive: true,
        parentId: true,
      },
    });
    return row;
  }

  if (dryRun) {
    return existing;
  }

  const updates: Prisma.CategoryUpdateInput = {};
  if (existing.slug !== slug) updates.slug = slug;
  if (existing.description !== canonical.description) updates.description = canonical.description;
  if (!existing.icon) updates.icon = '📘';
  if (existing.parentId !== parentId) updates.parent = { connect: { id: parentId } };
  if (!existing.isActive) updates.isActive = true;
  if (Object.keys(updates).length === 0) {
    return existing;
  }
  const updated = await prisma.category.update({
    where: { id: existing.id },
    data: updates,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      position: true,
      isActive: true,
      parentId: true,
    },
  });
  return updated;
}

async function reparentCanonicalCategory(
  row: CategoryRow,
  desiredParentId: string,
): Promise<void> {
  if (row.parentId === desiredParentId) return;
  if (dryRun) return;
  await prisma.category.update({
    where: { id: row.id },
    data: { parent: { connect: { id: desiredParentId } } },
  });
}

async function mergeCategories(
  mergePlan: { from: string; to: string }[],
  byName: Map<string, CategoryRow>,
  canonicalIdByName: Map<string, string>,
): Promise<{ merged: number; questionsMoved: number }> {
  let merged = 0;
  let questionsMoved = 0;
  for (const plan of mergePlan) {
    const source = byName.get(plan.from);
    if (!source) continue;
    const targetId = canonicalIdByName.get(plan.to);
    if (!targetId) continue;
    if (source.id === targetId) continue;

    if (!dryRun) {
      const updated = await prisma.question.updateMany({
        where: { categoryId: source.id },
        data: { categoryId: targetId },
      });
      questionsMoved += updated.count;
      // Re-home any child categories before delete (parentId Restrict).
      await prisma.category.updateMany({
        where: { parentId: source.id },
        data: { parentId: targetId },
      });
      await prisma.category.delete({ where: { id: source.id } });
    }
    merged += 1;
  }
  return { merged, questionsMoved };
}

async function organizeCategories(): Promise<CategoryStats> {
  const rows = await loadCategories();
  const byName = new Map(rows.map((row) => [row.name, row]));
  const usedSlugs = new Set(
    rows.map((row) => row.slug).filter((value): value is string => Boolean(value)),
  );
  const domainParentNames = new Set(MASTER_DOMAINS.map((domain) => domain.name));
  const canonicalNames = new Set(CANONICAL_CATEGORIES.map((category) => category.name));

  const createdDomains = await ensureDomainParents(byName);
  if (!dryRun) {
    const fresh = await loadCategories();
    rows.length = 0;
    rows.push(...fresh);
    byName.clear();
    for (const row of rows) byName.set(row.name, row);
  } else {
    for (const domain of createdDomains) {
      if (!byName.has(domain.name)) {
        byName.set(domain.name, {
          id: domain.id,
          name: domain.name,
          slug: slugify(domain.name),
          description: null,
          icon: null,
          position: 0,
          isActive: true,
          parentId: null,
        });
      }
    }
  }

  const canonicalIdByName = new Map<string, string>();
  let createdCanonicals = 0;
  let reparented = 0;
  for (const canonical of CANONICAL_CATEGORIES) {
    const domainParent = byName.get(domainParentName(canonical.domainId));
    if (!domainParent) continue;
    const existed = byName.has(canonical.name);
    const row = await ensureCanonicalCategory(canonical, domainParent.id, usedSlugs);
    canonicalIdByName.set(canonical.name, row.id);
    byName.set(row.name, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      position: row.position,
      isActive: row.isActive,
      parentId: row.parentId,
    });
    if (!existed) createdCanonicals += 1;
    if (row.parentId !== domainParent.id) {
      await reparentCanonicalCategory(row, domainParent.id);
      reparented += 1;
    }
  }

  const mergePlan = buildCategoryMergePlan(
    rows
      .filter(
        (row) =>
          !canonicalIdByName.has(row.name) &&
          !domainParentNames.has(row.name) &&
          !canonicalNames.has(row.name),
      )
      .map((row) => row.name),
  );
  const { merged, questionsMoved } = await mergeCategories(mergePlan, byName, canonicalIdByName);

  // Refresh after merges so parent ids stay valid.
  if (!dryRun) {
    const fresh = await loadCategories();
    byName.clear();
    for (const row of fresh) byName.set(row.name, row);
  }

  // Re-home leftover root categories that are neither domains nor canonical leaves.
  if (!dryRun) {
    const remaining = await prisma.category.findMany({
      where: { parentId: null },
      select: { id: true, name: true },
    });
    for (const orphan of remaining) {
      if (domainParentNames.has(orphan.name) || canonicalNames.has(orphan.name)) continue;
      const normalized = normalizeCategoryName(orphan.name);
      const domainId = normalized
        ? (DOMAIN_TO_CANONICAL.get(normalized) ?? getMasterDomainIdForName(normalized))
        : 'general';
      const parentName = domainParentName(domainId);
      const parent = byName.get(parentName);
      if (!parent || parent.id === orphan.id) continue;
      await prisma.category.update({
        where: { id: orphan.id },
        data: { parent: { connect: { id: parent.id } } },
      });
      reparented += 1;
    }

    // Keep canonical categories under their domain parents.
    for (const canonical of CANONICAL_CATEGORIES) {
      const row = byName.get(canonical.name);
      const parent = byName.get(domainParentName(canonical.domainId));
      if (!row || !parent) continue;
      if (row.parentId === parent.id) continue;
      await prisma.category.update({
        where: { id: row.id },
        data: { parent: { connect: { id: parent.id } } },
      });
      reparented += 1;
    }
  }

  return {
    createdDomains: createdDomains.length,
    createdCanonicals,
    reparented,
    merged,
    questionsMoved,
    skipped: 0,
  } satisfies CategoryStats;
}

function getMasterDomainIdForName(name: string): CanonicalCategory['domainId'] {
  for (const domain of MASTER_DOMAINS) {
    if (domain.matchedCategories.includes(name)) return domain.id;
  }
  return 'general';
}

type KeywordStats = {
  updated: number;
  tagsCreated: number;
  skipped: number;
};

async function organizeKeywords(): Promise<KeywordStats> {
  const updated = await prisma.question.findMany({
    where: { keywords: { equals: [] } },
    select: {
      id: true,
      prompt: true,
      keywords: true,
      category: { select: { name: true } },
    },
  });

  let touched = 0;
  let tagsCreated = 0;
  for (const question of updated) {
    const generated = questionAutoKeywords(question.prompt, question.category?.name ?? null);
    if (generated.length === 0) continue;
    if (dryRun) {
      touched += 1;
      continue;
    }
    const merged = Array.from(
      new Set([...question.keywords, ...generated].map((value) => foldKeyword(value)).filter(Boolean)),
    ).slice(0, MAX_KEYWORDS_PER_QUESTION);

    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: question.id },
        data: { keywords: merged, lastEditedAt: new Date() },
      });
      for (const tag of generated) {
        await tx.questionTag.upsert({
          where: { questionId_tag: { questionId: question.id, tag } },
          update: {},
          create: { questionId: question.id, tag },
        });
        tagsCreated += 1;
      }
    });
    touched += 1;
  }

  return { updated: touched, tagsCreated, skipped: 0 };
}

type ValidationStats = {
  repaired: number;
  versioned: number;
  lastEditedTouched: number;
  withIssues: number;
};

async function repairQuestions(): Promise<ValidationStats> {
  const rows = await prisma.question.findMany({
    select: {
      id: true,
      type: true,
      options: { select: { text: true, isCorrect: true } },
    },
  });

  let repaired = 0;
  let versioned = 0;
  let lastEditedTouched = 0;
  let withIssues = 0;

  for (const row of rows) {
    if (row.type === 'SHORT_ANSWER') {
      const correctOption = row.options.find((option) => option.isCorrect);
      const text = correctOption?.text;
      if (text && text.trim().length > 0) {
        if (!dryRun) {
          await prisma.question.update({
            where: { id: row.id },
            data: { expectedAnswer: text.trim().slice(0, 200) },
          });
        }
        repaired += 1;
      } else {
        withIssues += 1;
      }
    }

    if (!dryRun) {
      const updated = await prisma.question.update({
        where: { id: row.id },
        data: { lastEditedAt: new Date() },
        select: { version: true, lastEditedAt: true },
      });
      if (updated.version < 2) {
        await prisma.question.update({
          where: { id: row.id },
          data: { version: { increment: 1 } },
        });
        versioned += 1;
      }
      lastEditedTouched += 1;
    }
  }

  return { repaired, versioned, lastEditedTouched, withIssues };
}

type Report = {
  dryRun: boolean;
  categories: CategoryStats;
  keywords: KeywordStats;
  validation: ValidationStats;
};

async function main(): Promise<void> {
  console.info('🗂️  بدء تنظيم بنك الأسئلة في «تحدّي»...');
  console.info(`   الوضع: ${dryRun ? 'محاكاة بدون كتابة' : 'كتابة فعلية على قاعدة البيانات'}`);

  const report: Report = {
    dryRun,
    categories: {
      createdDomains: 0,
      createdCanonicals: 0,
      reparented: 0,
      merged: 0,
      skipped: 0,
      questionsMoved: 0,
    },
    keywords: { updated: 0, tagsCreated: 0, skipped: 0 },
    validation: { repaired: 0, versioned: 0, lastEditedTouched: 0, withIssues: 0 },
  };

  if (shouldRunPhase('categories')) {
    console.info('  → المرحلة 1/3: تنظيم شجرة التصنيفات ودمج المرادفات');
    report.categories = await organizeCategories();
  }
  if (shouldRunPhase('keywords')) {
    console.info('  → المرحلة 2/3: توليد الكلمات المفتاحية والـ Tags');
    report.keywords = await organizeKeywords();
  }
  if (shouldRunPhase('validation')) {
    console.info('  → المرحلة 3/3: إصلاح expectedAnswer و version / lastEditedAt');
    report.validation = await repairQuestions();
  }

  console.info('\n══════════════════════════════════════════════════════════════════');
  console.info('         📊  تقرير تنظيم بنك الأسئلة — تحدّي');
  console.info('══════════════════════════════════════════════════════════════════');
  console.info(
    `🆕  فئات المجالات المُنشأة:   ${report.categories.createdDomains.toLocaleString('ar-SA')}`,
  );
  console.info(
    `📚  فئات كانونية مُنشأة:      ${report.categories.createdCanonicals.toLocaleString('ar-SA')}`,
  );
  console.info(
    `🔁  عمليات إعادة الأبوة:       ${report.categories.reparented.toLocaleString('ar-SA')}`,
  );
  console.info(
    `🪢  فئات تم دمجها في كانونية:  ${report.categories.merged.toLocaleString('ar-SA')}`,
  );
  console.info(
    `🔀  أسئلة نُقلت أثناء الدمج:   ${report.categories.questionsMoved.toLocaleString('ar-SA')}`,
  );
  console.info(
    `🏷️  أسئلة تم توليد كلمات لها:   ${report.keywords.updated.toLocaleString('ar-SA')}`,
  );
  console.info(
    `🗂️  وسوم QuestionTag أُضيفت:    ${report.keywords.tagsCreated.toLocaleString('ar-SA')}`,
  );
  console.info(
    `🩹  إصلاحات expectedAnswer:     ${report.validation.repaired.toLocaleString('ar-SA')}`,
  );
  console.info(
    `⚠️  أسئلة بإجابة قصيرة ناقصة:   ${report.validation.withIssues.toLocaleString('ar-SA')}`,
  );
  console.info(
    `⏱️  أسئلة تم تحديث lastEditedAt: ${report.validation.lastEditedTouched.toLocaleString('ar-SA')}`,
  );
  console.info(
    `🔢  أسئلة تم تحديث version:     ${report.validation.versioned.toLocaleString('ar-SA')}`,
  );
  console.info('──────────────────────────────────────────────────────────────────\n');
}

main()
  .catch((error) => {
    console.error('❌ فشل تنظيم بنك الأسئلة:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
