/**
 * Keyword / tag utilities for the question bank.
 *
 * Each question can carry up to 12 controlled keywords. The engine
 * normalises incoming keywords (lowercase, no diacritics, no alef
 * variants, trimmed, deduped) so that "السعودية", "سعودية", "السعوديه"
 * all collapse to the same tag and the search index returns the
 * same questions for any of them.
 */

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const PUNCTUATION = /[^\p{L}\p{N}\s]/gu;

export const MAX_KEYWORDS_PER_QUESTION = 12;
export const MAX_KEYWORD_LENGTH = 60;

export function foldKeyword(input: string): string {
  return input
    .normalize('NFKC')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // Replace every non-letter/non-number with a single space so
    // "،" and "!" do not glue adjacent words together.
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type KeywordNormalization = {
  raw: string;
  folded: string;
};

export function normalizeKeywords(input: ReadonlyArray<string>): KeywordNormalization[] {
  const seen = new Set<string>();
  const out: KeywordNormalization[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const folded = foldKeyword(trimmed);
    if (!folded) continue;
    if (seen.has(folded)) continue;
    seen.add(folded);
    out.push({ raw: trimmed.slice(0, MAX_KEYWORD_LENGTH), folded });
  }
  return out;
}

export function isValidKeyword(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_KEYWORD_LENGTH) return false;
  // The folded form is what we store; the original must contain at
  // least one Arabic or Latin letter.
  return /[\p{L}]/u.test(trimmed);
}

export function clampKeywords(input: ReadonlyArray<string>): string[] {
  const normalized = normalizeKeywords(input);
  if (normalized.length <= MAX_KEYWORDS_PER_QUESTION) {
    return normalized.map((entry) => entry.raw);
  }
  return normalized
    .slice(0, MAX_KEYWORDS_PER_QUESTION)
    .map((entry) => entry.raw);
}

/**
 * Build a Postgres "contains" filter for a single keyword, or
 * return `undefined` if the keyword is empty. The caller feeds the
 * result to a Prisma `where.keywords: { has: ... }` query.
 */
export function keywordContainsFilter(keyword: string): string | undefined {
  const trimmed = keyword.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_KEYWORD_LENGTH);
}

export function intersectKeywords(
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
): string[] {
  const aFolded = new Set(a.map(foldKeyword).filter(Boolean));
  return b
    .map(foldKeyword)
    .filter((tag): tag is string => Boolean(tag) && aFolded.has(tag));
}

export function uniqueKeywords(input: ReadonlyArray<string>): string[] {
  return normalizeKeywords(input).map((entry) => entry.raw);
}
