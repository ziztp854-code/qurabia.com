import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import {
  isValidLadderQuestionCandidate,
  ladderQuestionFingerprint,
  type LadderQuestionCandidate,
} from './ladder-question-selection.js';

const BANK_SHA256 =
  'a9a64662bbd19c6d6be437b18e7a8ed284fc936d2e8305620504c72031019a53';
const candidateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE']),
  prompt: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  timeLimit: z.number(),
  category: z.object({ id: z.string(), name: z.string() }),
  options: z.array(
    z.object({ id: z.string(), text: z.string(), isCorrect: z.boolean() }),
  ),
});
const bankSchema = z.object({
  version: z.literal(1),
  sets: z.array(z.array(candidateSchema)),
  publishedBankIds: z.array(z.string()),
});
export type PrivateCompetitionBank = {
  version: 1;
  sets: LadderQuestionCandidate[][];
  publishedBankIds: string[];
};

export function parsePrivateCompetitionBank(
  encoded: string,
  expectedSha256: string,
): PrivateCompetitionBank {
  const bytes = gunzipSync(Buffer.from(encoded, 'base64'), {
    maxOutputLength: 262_144,
  });
  if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256)
    throw new Error('Competition bank integrity check failed');
  const bank = bankSchema.parse(JSON.parse(bytes.toString('utf8')));
  const all = bank.sets.flat();
  if (
    bank.sets.length !== 8 ||
    all.length !== 80 ||
    new Set(all.map((q) => q.id)).size !== 80 ||
    new Set(all.map((q) => ladderQuestionFingerprint(q.prompt))).size !== 80
  )
    throw new Error('Invalid competition bank');
  for (const set of bank.sets) {
    if (
      set.length !== 10 ||
      set.some((q) => !isValidLadderQuestionCandidate(q)) ||
      ['EASY', 'MEDIUM', 'HARD'].some(
        (difficulty, i) =>
          set.filter((q) => q.difficulty === difficulty).length !==
          [3, 3, 4][i],
      )
    )
      throw new Error('Invalid competition set');
  }
  if (
    new Set(bank.publishedBankIds).size !== 9 ||
    bank.publishedBankIds.some((id) => !bank.sets[0].some((q) => q.id === id))
  )
    throw new Error('Invalid published question list');
  return bank;
}

export function readPrivateCompetitionBank(): PrivateCompetitionBank {
  const encoded = process.env.LADDER_COMPETITION_BANK_GZIP_BASE64;
  if (!encoded) throw new Error('Competition bank is not configured');
  return parsePrivateCompetitionBank(encoded, BANK_SHA256);
}
