import { decode, type JWT, type JWTDecodeParams } from 'next-auth/jwt';
import { getPrismaClient, hasDatabaseUrl } from './prisma';
import { isSessionUserCurrent } from './session-user';

export async function decodeCurrentSessionToken(params: JWTDecodeParams): Promise<JWT | null> {
  try {
    // Keep NextAuth's authenticated decryption and expiry validation first.
    const token = await decode(params);
    if (
      !token || typeof token.id !== 'string' || !token.id ||
      token.sub !== token.id || typeof token.tokenVersion !== 'number' ||
      !hasDatabaseUrl()
    ) {
      return null;
    }

    const storedUser = await getPrismaClient().user.findUnique({
      where: { id: token.id },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
    return isSessionUserCurrent({ id: token.id, tokenVersion: token.tokenVersion }, storedUser)
      ? token
      : null;
  } catch {
    // An invalid or unverifiable cookie cannot authorize OAuth account linking.
    return null;
  }
}
