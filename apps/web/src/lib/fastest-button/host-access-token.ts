import { createFastestButtonHostAccessToken } from '@tahaddi/contracts';
export function createHostFastestButtonAccessToken(hostId: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required for fastest-button host access.');
  return createFastestButtonHostAccessToken(secret, {
    hostId,
    expiresAt: Date.now() + 3 * 60 * 60_000,
  });
}
