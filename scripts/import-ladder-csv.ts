/**
 * Import ladder MCQ/true-false questions from a CSV into the shared bank.
 *
 * CSV columns:
 *   question,type,category,difficulty,options,correctAnswer,keywords,
 *   source,sourceUrl,gameMode,status
 *
 * Usage:
 *   pnpm exec tsx scripts/import-ladder-csv.ts --file path.csv
 *   pnpm exec tsx scripts/import-ladder-csv.ts --file path.csv --dry-run
 *   pnpm exec tsx scripts/import-ladder-csv.ts --file path.csv --keep-draft
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { config } from 'dotenv';
import { createPrismaClient } from '@tahaddi/database';
import { normalizeCategoryName } from '../apps/web/src/lib/questions/category-taxonomy';
import {
  clampKeywords,
  foldKeyword,
  normalizeKeywords,
} from '../apps/web/src/lib/questions/keywords';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DIRECT_URL or DATABASE_URL is required');
  process.exit(1);
}

const prisma = createPrismaClient(connectionString);
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const keepDraft = argv.includes('--keep-draft');
const fileFlag = argv.findIndex((arg) => arg === '--file');
const filePath = fileFlag >= 0 ? argv[fileFlag + 1] : undefined;

if (!filePath) {
  console.error('Usage: tsx scripts/import-ladder-csv.ts --file <path.csv> [--dry-run] [--keep-draft]');
  process.exit(1);
}

const CATEGORY_CSV_MAP: Record<string, string> = {
  العلوم: 'علوم',
  الجغرافيا: 'جغرافيا',
  الرياضة: 'رياضة',
  'الثقافة العامة': 'ثقافة عامة',
  'الثقافة الإسلامية': 'ثقافة إسلامية',
  التقنية: 'تقنية',
  'اللغة والأدب': 'أدب ولغة',
  التاريخ: 'تاريخ',
  'السعودية والخليج والعالم العربي': 'جغرافيا',
};

type CsvRow = {
  question: string;
  type: string;
  category: string;
  difficulty: string;
  options: string;
  correctAnswer: string;
  keywords: string;
  source: string;
  sourceUrl: string;
  gameMode: string;
  status: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

async function readCsv(path: string): Promise<CsvRow[]> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const rows: CsvRow[] = [];
  let headers: string[] | null = null;

  for await (const rawLine of rl) {
    const line = rawLine.replace(/^\uFEFF/, '');
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!headers) {
      headers = cells.map((cell) => cell.trim());
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    rows.push(row as CsvRow);
  }
  return rows;
}

function normalizePrompt(prompt: string): string {
  return prompt
    .replace(/\s*\((?:نموذج|دورة|حلقة|سلسلة)\s*\d+\)\s*/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCanonicalCategory(raw: string): string {
  const mapped = CATEGORY_CSV_MAP[raw.trim()] ?? raw.trim();
  return normalizeCategoryName(mapped) ?? mapped;
}

function parseOptions(row: CsvRow): { text: string; isCorrect: boolean }[] | null {
  const options = row.options
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const correct = row.correctAnswer.trim();
  if (!correct || options.length === 0) return null;
  if (row.type === 'TRUE_FALSE' && options.length !== 2) return null;
  if (row.type === 'MULTIPLE_CHOICE' && (options.length < 3 || options.length > 4)) return null;
  if (!options.includes(correct)) return null;
  const unique = new Set(options.map((text) => text.replace(/\s+/g, ' ').toLocaleLowerCase('ar')));
  if (unique.size !== options.length) return null;
  return options.map((text) => ({ text, isCorrect: text === correct }));
}

async function ensureOwnerId(): Promise<string> {
  const preferred = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'seed@tahaddi.local' },
        { role: { in: ['ADMIN', 'OWNER', 'CONTENT_EDITOR'] } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!preferred) {
    throw new Error('No suitable owner user found for imported questions.');
  }
  return preferred.id;
}

async function ensureCategoryId(name: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const existing = await prisma.category.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    cache.set(name, existing.id);
    return existing.id;
  }
  const created = await prisma.category.create({
    data: {
      name,
      slug: name
        .normalize('NFKC')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .slice(0, 100),
      isActive: true,
    },
    select: { id: true },
  });
  cache.set(name, created.id);
  return created.id;
}

async function main() {
  const rows = await readCsv(filePath!);
  console.info(`CSV rows: ${rows.length.toLocaleString('ar-SA')}`);

  const unique = new Map<string, CsvRow>();
  let nearDupes = 0;
  for (const row of rows) {
    const key = normalizePrompt(row.question);
    if (!key) continue;
    if (unique.has(key)) {
      nearDupes += 1;
      continue;
    }
    unique.set(key, { ...row, question: key });
  }

  const prepared: Array<{
    prompt: string;
    type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    categoryName: string;
    options: { text: string; isCorrect: boolean }[];
    keywords: string[];
    source: string | null;
  }> = [];
  let skippedInvalid = 0;

  for (const row of unique.values()) {
    if (row.type !== 'MULTIPLE_CHOICE' && row.type !== 'TRUE_FALSE') {
      skippedInvalid += 1;
      continue;
    }
    if (!['EASY', 'MEDIUM', 'HARD'].includes(row.difficulty)) {
      skippedInvalid += 1;
      continue;
    }
    const options = parseOptions(row);
    if (!options) {
      skippedInvalid += 1;
      continue;
    }
    const keywordParts = row.keywords
      .split(/[,،]/u)
      .map((part) => part.trim())
      .filter(Boolean);
    const keywords = clampKeywords(
      normalizeKeywords(keywordParts).map((entry) => foldKeyword(entry.raw) || entry.raw),
    );
    prepared.push({
      prompt: row.question,
      type: row.type,
      difficulty: row.difficulty as 'EASY' | 'MEDIUM' | 'HARD',
      categoryName: resolveCanonicalCategory(row.category),
      options,
      keywords,
      source: row.source || row.sourceUrl || 'ladder-csv-import',
    });
  }

  console.info(
    JSON.stringify(
      {
        dryRun,
        keepDraft,
        nearDupesDropped: nearDupes,
        skippedInvalid,
        readyToImport: prepared.length,
        byCategory: prepared.reduce<Record<string, number>>((acc, row) => {
          acc[row.categoryName] = (acc[row.categoryName] ?? 0) + 1;
          return acc;
        }, {}),
        byDifficulty: prepared.reduce<Record<string, number>>((acc, row) => {
          acc[row.difficulty] = (acc[row.difficulty] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  const ownerId = await ensureOwnerId();
  const categoryCache = new Map<string, string>();
  const status = keepDraft ? 'DRAFT' : 'PUBLISHED';
  let created = 0;
  let skippedExisting = 0;

  for (const item of prepared) {
    const existing = await prisma.question.findFirst({
      where: { prompt: item.prompt },
      select: { id: true },
    });
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const categoryId = await ensureCategoryId(item.categoryName, categoryCache);
    await prisma.question.create({
      data: {
        ownerId,
        type: item.type,
        status,
        difficulty: item.difficulty,
        prompt: item.prompt,
        categoryId,
        gameTypes: ['LADDER', 'QUIZ'],
        keywords: item.keywords,
        source: item.source,
        timeLimit: 30,
        basePoints: 1000,
        options: {
          create: item.options.map((option, position) => ({
            position,
            text: option.text,
            isCorrect: option.isCorrect,
          })),
        },
      },
    });
    created += 1;
    if (created % 50 === 0) {
      console.info(`  imported ${created}/${prepared.length}`);
    }
  }

  console.info(
    JSON.stringify(
      {
        created,
        skippedExisting,
        status,
        gameTypes: ['LADDER', 'QUIZ'],
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
  .finally(async () => {
    await prisma.$disconnect();
  });
