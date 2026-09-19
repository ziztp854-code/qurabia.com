import { createScrambledWordsHostAccessToken } from '@tahaddi/contracts';

const SCRAMBLED_WORDS_HOST_SESSION_MS = 3 * 60 * 60_000;

function getAccessSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required for scrambled-words host access.');
  }
  return secret;
}

export function createHostScrambledWordsAccessToken(hostId: string) {
  return createScrambledWordsHostAccessToken(getAccessSecret(), {
    hostId,
    expiresAt: Date.now() + SCRAMBLED_WORDS_HOST_SESSION_MS,
  });
}
