/**
 * Seed Scrambled-Words-Live puzzles from a JSON manifest + local images.
 *
 * Manifest format (JSON array):
 *   [{ "file": "beach.jpg", "words": ["بحر", "امواج", "شاطئ"], "category": "طبيعة" }]
 *
 * Images are copied into apps/web/public/games/scrambled-words-live/ and each
 * row is stored with a public imageUrl served by the web app.
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-scrambled-words-puzzles.ts --manifest <path.json>
 *   pnpm exec tsx scripts/seed-scrambled-words-puzzles.ts --manifest <path.json> --dry-run
 */
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { createPrismaClient } from '@tahaddi/database';

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
const manifestFlag = argv.findIndex((arg) => arg === '--manifest');
const manifestPath = manifestFlag >= 0 ? argv[manifestFlag + 1] : undefined;

if (!manifestPath) {
  console.error(
    'Usage: tsx scripts/seed-scrambled-words-puzzles.ts --manifest <path.json> [--dry-run]',
  );
  process.exit(1);
}

const WEB_PUBLIC_DIR = path.resolve(
  process.cwd(),
  'apps/web/public/games/scrambled-words-live',
);
const PUBLIC_URL_BASE = '/games/scrambled-words-live';
const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
]);

type ManifestEntry = {
  file: string;
  words: string[];
  category?: string;
};

function slugifyImageName(fileName: string): string {
  const parsed = path.parse(fileName);
  const base = parsed.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  const extension = parsed.ext.toLowerCase();
  return `${base || 'puzzle'}${extension.toLowerCase()}`;
}

async function copyImage(sourcePath: string, fileName: string): Promise<string> {
  mkdirSync(WEB_PUBLIC_DIR, { recursive: true });
  const targetName = slugifyImageName(fileName);
  const targetPath = path.join(WEB_PUBLIC_DIR, targetName);
  await copyFile(sourcePath, targetPath);
  return `${PUBLIC_URL_BASE}/${targetName}`;
}

function validateEntry(entry: ManifestEntry, index: number): string | null {
  if (!entry.file || typeof entry.file !== 'string') {
    return `السجل ${index + 1}: حقل file مفقود`;
  }
  const extension = path.extname(entry.file).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `السجل ${index + 1}: امتداد غير مدعوم (${extension || 'بلا امتداد'})`;
  }
  if (!Array.isArray(entry.words) || entry.words.length === 0) {
    return `السجل ${index + 1}: لا توجد كلمات`;
  }
  if (entry.words.length > 12) {
    return `السجل ${index + 1}: أكثر من 12 كلمة`;
  }
  for (const word of entry.words) {
    if (typeof word !== 'string' || word.trim().length < 2 || word.trim().length > 40) {
      return `السجل ${index + 1}: كلمة غير صالحة (${String(word).slice(0, 20)})`;
    }
  }
  return null;
}

async function main() {
  if (!existsSync(manifestPath as string)) {
    console.error(`ملف البيانات غير موجود: ${manifestPath}`);
    process.exit(1);
  }

  const raw = await readFile(manifestPath as string, 'utf8');
  let entries: ManifestEntry[];
  try {
    entries = JSON.parse(raw) as ManifestEntry[];
  } catch (error) {
    console.error('تعذّر تحليل ملف JSON:', (error as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.error('ملف البيانات فارغ أو ليس مصفوفة');
    process.exit(1);
  }

  const manifestDir = path.dirname(path.resolve(manifestPath as string));
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, entry] of entries.entries()) {
    const validationError = validateEntry(entry, index);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    const sourcePath = path.resolve(manifestDir, entry.file);
    if (!existsSync(sourcePath)) {
      errors.push(`السجل ${index + 1}: الصورة غير موجودة (${entry.file})`);
      continue;
    }

    const words = entry.words.map((word) => word.trim().replace(/\s+/g, ' '));
    const uniqueWords = [...new Set(words)];

    if (dryRun) {
      console.log(`[dry-run] ${entry.file} → ${uniqueWords.join(' | ')}`);
      created += 1;
      continue;
    }

    const imageUrl = await copyImage(sourcePath, entry.file);
    const existing = await prisma.scrambledWordsPuzzle.findFirst({
      where: { imageUrl },
      select: { id: true },
    });

    if (existing) {
      await prisma.scrambledWordsPuzzle.update({
        where: { id: existing.id },
        data: { words: uniqueWords, category: entry.category ?? null },
      });
      skipped += 1;
      continue;
    }

    await prisma.scrambledWordsPuzzle.create({
      data: {
        imageUrl,
        words: uniqueWords,
        category: entry.category ?? null,
        status: 'PUBLISHED',
      },
    });
    created += 1;
  }

  if (errors.length > 0) {
    console.warn('\nتحذيرات:');
    for (const message of errors) console.warn(`  - ${message}`);
  }

  console.log(
    `\nتمت إضافة ${created} لغزًا${skipped > 0 ? ` وتحديث ${skipped} موجودًا` : ''}.`,
  );

  if (dryRun) {
    console.log('(تشغيل تجريبي — لم تُكتب أي بيانات)');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
