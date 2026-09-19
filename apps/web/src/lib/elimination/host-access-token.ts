import { createEliminationHostAccessToken } from '@tahaddi/contracts';

const ELIMINATION_HOST_SESSION_MS = 3 * 60 * 60_000;

function getAccessSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required for elimination host access.');
  }
  return secret;
}

export function createHostEliminationAccessToken(hostId: string) {
  return createEliminationHostAccessToken(getAccessSecret(), {
    hostId,
    expiresAt: Date.now() + ELIMINATION_HOST_SESSION_MS,
  });
}
