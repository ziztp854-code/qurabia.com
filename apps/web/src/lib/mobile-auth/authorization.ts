import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { resolveMobileAuthSecret, verifyMobileAccessToken } from './tokens';

export type AuthenticatedMobileUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  tokenVersion: number;
};

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')?.trim();
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  return match?.[1] ?? null;
}

/**
 * Authenticates a mobile access token and re-checks revocation-sensitive user
 * state. A missing or invalid token returns null; callers decide whether that
 * means guest access or an HTTP 401 response.
 */
export async function requireMobileUser(request: Request): Promise<AuthenticatedMobileUser | null> {
  const token = bearerToken(request);
  if (!token || !hasDatabaseUrl()) return null;

  let claims;
  try {
    claims = verifyMobileAccessToken(resolveMobileAuthSecret(), token);
  } catch {
    return null;
  }
  if (!claims) return null;

  const user = await getPrismaClient().user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      status: true,
      tokenVersion: true,
    },
  });
  if (
    !user?.email ||
    user.status !== 'ACTIVE' ||
    user.tokenVersion !== claims.tokenVersion ||
    user.role !== claims.role
  ) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };
}

export const getOptionalMobileUser = requireMobileUser;
