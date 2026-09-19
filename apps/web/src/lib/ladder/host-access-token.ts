import { createLadderHostAccessToken } from '@tahaddi/contracts';

const LADDER_HOST_SESSION_MS = 3 * 60 * 60_000;

function getAccessSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required for ladder host access.');
  }
  return secret;
}

export function createHostLadderAccessToken(hostId: string) {
  return createLadderHostAccessToken(getAccessSecret(), {
    hostId,
    expiresAt: Date.now() + LADDER_HOST_SESSION_MS,
  });
}
