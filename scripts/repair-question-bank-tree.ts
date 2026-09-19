/**
 * Repair the Domain → Canonical category tree after a partial organize run.
 * Safe / idempotent. Also backfills empty keywords.
 *
 * Usage: pnpm exec tsx scripts/repair-question-bank-tree.ts
 */
import { config } from 'dotenv';
import { createPrismaClient } from '@tahaddi/database';
import {
  CANONICAL_CATEGORIES,
  normalizeCategoryName,
} from '../apps/web/src/lib/questions/category-taxonomy';
import { MASTER_DOMAINS } from '../apps/web/src/lib/questions/bank-index';
import {
  foldKeyword,
  normalizeKeywords,
  MAX_KEYWORDS_PER_QUESTION,
} from '../apps/web/src/lib/questions/keywords';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DIRECT_URL or DATABASE_URL required');
  process.exit(1);
}

const prisma = createPrismaClient(connectionString);
const dryRun = process.argv.includes('--dry-run');

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

function uniqueSlug(base: string, used: Set<string>): string {
  let slug = slugify(base) || 'category';
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let i = 2;
  while (used.has(`${slug}-${i}`)) i += 1;
  const next = `${slug}-${i}`;
  used.add(next);
  return next;
}

function autoKeywords(prompt: string, categoryName: string | null): string[] {
  const candidates: string[] = [];
  if (categoryName) candidates.push(categoryName);
  const tokens = prompt
    .split(/[\s,،.!?؛:«»()\[\]"]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 40);
  candidates.push(...tokens.slice(0, 8));
  return normalizeKeywords(candidates)
    .slice(0, MAX_KEYWORDS_PER_QUESTION)
    .map((entry) => entry.raw);
}

async function main() {
  console.info(`Repairing category tree (${dryRun ? 'dry-run' : 'apply'})...`);

  const existing = await prisma.category.findMany();
  const byName = new Map(existing.map((row) => [row.name, row]));
  const usedSlugs = new Set(
    existing.map((row) => row.slug).filter((value): value is string => Boolean(value)),
  );

  let domainsCreated = 0;
  const domainIdByKey = new Map<string, string>();

  for (const [index, domain] of MASTER_DOMAINS.entries()) {
    let row = byName.get(domain.name);
    if (!row) {
      domainsCreated += 1;
      if (!dryRun) {
        row = await prisma.category.create({
          data: {
            name: domain.name,
            slug: uniqueSlug(domain.id, usedSlugs),
            description: domain.description,
            icon: domain.icon,
            position: index,
            isActive: true,
            parentId: null,
          },
        });
        byName.set(row.name, row);
      } else {
        domainIdByKey.set(domain.id, `dry-${domain.id}`);
        continue;
      }
    } else if (!dryRun && row.parentId !== null) {
      row = await prisma.category.update({
        where: { id: row.id },
        data: { parentId: null, isActive: true },
      });
      byName.set(row.name, row);
    }
    domainIdByKey.set(domain.id, row!.id);
  }

  let canonicalEnsured = 0;
  let reparented = 0;

  for (const [index, canonical] of CANONICAL_CATEGORIES.entries()) {
    const parentId = domainIdByKey.get(canonical.domainId);
    if (!parentId || parentId.startsWith('dry-')) continue;

    let row = byName.get(canonical.name);
    if (!row) {
      canonicalEnsured += 1;
      if (!dryRun) {
        row = await prisma.category.create({
          data: {
            name: canonical.name,
            slug: uniqueSlug(canonical.name, usedSlugs),
            description: canonical.description,
            icon: '📘',
            position: index,
            isActive: true,
            parentId,
          },
        });
        byName.set(row.name, row);
      }
      continue;
    }

    if (!dryRun && row.parentId !== parentId) {
      await prisma.category.update({
        where: { id: row.id },
        data: { parentId, isActive: true, description: canonical.description },
      });
      reparented += 1;
    }
  }

  // Move questions from synonym categories into canonicals, then deactivate empties.
  let questionsMoved = 0;
  let deactivated = 0;
  const canonicalNameSet = new Set(CANONICAL_CATEGORIES.map((c) => c.name));
  const domainNameSet = new Set(MASTER_DOMAINS.map((d) => d.name));

  for (const row of [...byName.values()]) {
    if (canonicalNameSet.has(row.name) || domainNameSet.has(row.name)) continue;
    const targetName = normalizeCategoryName(row.name);
    if (!targetName || targetName === row.name) continue;
    const target = byName.get(targetName);
    if (!target) continue;
    if (dryRun) continue;

    const moved = await prisma.question.updateMany({
      where: { categoryId: row.id },
      data: { categoryId: target.id },
    });
    questionsMoved += moved.count;

    await prisma.category.updateMany({
      where: { parentId: row.id },
      data: { parentId: target.id },
    });

    const remainingQuestions = await prisma.question.count({ where: { categoryId: row.id } });
    const remainingChildren = await prisma.category.count({ where: { parentId: row.id } });
    if (remainingQuestions === 0 && remainingChildren === 0) {
      await prisma.category.update({
        where: { id: row.id },
        data: { isActive: false },
      });
      deactivated += 1;
    }
  }

  // Keywords backfill (small sequential batches — remote DB latency is high)
  let keywordsUpdated = 0;
  let tagsCreated = 0;
  const emptyKeywordQuestions = await prisma.question.findMany({
    where: { keywords: { equals: [] } },
    select: {
      id: true,
      prompt: true,
      keywords: true,
      category: { select: { name: true } },
    },
  });

  const BATCH = 25;
  for (let offset = 0; offset < emptyKeywordQuestions.length; offset += BATCH) {
    const slice = emptyKeywordQuestions.slice(offset, offset + BATCH);
    for (const question of slice) {
      const generated = autoKeywords(question.prompt, question.category?.name ?? null);
      if (generated.length === 0) continue;
      const merged = Array.from(
        new Set(
          [...question.keywords, ...generated]
            .map((value) => foldKeyword(value))
            .filter(Boolean),
        ),
      ).slice(0, MAX_KEYWORDS_PER_QUESTION);
      keywordsUpdated += 1;
      if (dryRun) continue;
      await prisma.question.update({
        where: { id: question.id },
        data: { keywords: merged, lastEditedAt: new Date() },
      });
    }
    console.info(
      `  keywords progress ${Math.min(offset + BATCH, emptyKeywordQuestions.length)}/${emptyKeywordQuestions.length}`,
    );
  }

  const tree = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    select: {
      name: true,
      children: {
        where: { isActive: true },
        select: { name: true, _count: { select: { questions: true } } },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { position: 'asc' },
  });

  console.log(
    JSON.stringify(
      {
        dryRun,
        domainsCreated,
        canonicalEnsured,
        reparented,
        questionsMoved,
        deactivated,
        keywordsUpdated,
        tagsCreated,
        emptyKeywordsRemaining: emptyKeywordQuestions.length - (dryRun ? 0 : keywordsUpdated),
        tree: tree.map((domain) => ({
          domain: domain.name,
          children: domain.children.map((child) => ({
            name: child.name,
            questions: child._count.questions,
          })),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
