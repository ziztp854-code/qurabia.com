import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { applyLocalAuthBaseUrl } from './local-auth-url';
import { checkRateLimit } from './rate-limit';
import { getPrismaClient, hasDatabaseUrl } from './prisma';
import { signInSchema } from './validation';
import { verifyPassword } from './password';

applyLocalAuthBaseUrl();

const genericCredentialsMessage = 'تعذّر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.';

export function resolveNextAuthSecret(
  env: Pick<NodeJS.ProcessEnv, 'AUTH_SECRET' | 'NEXTAUTH_SECRET'> = process.env,
) {
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  return secret || undefined;
}

function getClientIp(req: { headers?: Record<string, string | string[] | undefined> }) {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return value?.split(',')[0]?.trim() || 'unknown';
}

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'البريد وكلمة المرور',
    credentials: {
      email: { label: 'البريد الإلكتروني', type: 'email' },
      password: { label: 'كلمة المرور', type: 'password' },
    },
    async authorize(credentials, req) {
      const parsed = signInSchema.safeParse(credentials);
      if (!parsed.success || !hasDatabaseUrl()) {
        return null;
      }

      const rateKey = `signin:${getClientIp(req)}:${parsed.data.email}`;
      if (!(await checkRateLimit(rateKey))) {
        return null;
      }

      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          passwordHash: true,
          role: true,
          status: true,
          tokenVersion: true,
        },
      });

      const validPassword = await verifyPassword(parsed.data.password, user?.passwordHash);
      if (!user || !validPassword || user.status !== 'ACTIVE') {
        return null;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        status: user.status,
        tokenVersion: user.tokenVersion,
      };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: hasDatabaseUrl() ? PrismaAdapter(getPrismaClient() as never) : undefined,
  secret: resolveNextAuthSecret(),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/sign-in',
  },
  providers,
  callbacks: {
    async signIn({ user }) {
      if (!user?.id || !hasDatabaseUrl()) {
        return true;
      }

      try {
        const storedUser = await getPrismaClient().user.findUnique({
          where: { id: user.id },
          select: { status: true },
        });
        return storedUser?.status !== 'SUSPENDED' && storedUser?.status !== 'DELETED';
      } catch {
        return true;
      }
    },
    async jwt({ token, user }) {
      const userId = user?.id ?? token.id;
      if (user?.id) {
        token.id = user.id;
      }
      const issuedRole = user ? (user as { role?: string }).role : undefined;
      const issuedStatus = user ? (user as { status?: string }).status : undefined;
      const issuedTokenVersion = user
        ? (user as { tokenVersion?: number }).tokenVersion
        : undefined;
      const missingStoredClaims =
        typeof (issuedRole ?? token.role) !== 'string' ||
        typeof (issuedStatus ?? token.status) !== 'string' ||
        typeof (issuedTokenVersion ?? token.tokenVersion) !== 'number';
      let storedUser: { role: string; status: string; tokenVersion: number } | null = null;
      if (userId && hasDatabaseUrl() && (!user || missingStoredClaims)) {
        try {
          storedUser = await getPrismaClient().user.findUnique({
            where: { id: String(userId) },
            select: { role: true, status: true, tokenVersion: true },
          });
        } catch {
          // Database connection failures (e.g. Docker not running) should
          // not crash the JWT callback. Fall back to token claims.
        }
      }
      token.role = storedUser?.role ?? issuedRole ?? token.role;
      token.status = storedUser?.status ?? issuedStatus ?? token.status;
      token.tokenVersion = issuedTokenVersion ?? token.tokenVersion ?? storedUser?.tokenVersion;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? '');
        session.user.tokenVersion =
          typeof token.tokenVersion === 'number' ? token.tokenVersion : -1;
        session.user.role = typeof token.role === 'string' ? token.role : 'USER';
        session.user.status = typeof token.status === 'string' ? token.status : 'ACTIVE';
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id && hasDatabaseUrl()) {
        try {
          await getPrismaClient().user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch {
          // Best-effort last-login update; ignore database failures.
        }
      }
    },
  },
  debug: false,
};

export { genericCredentialsMessage };
