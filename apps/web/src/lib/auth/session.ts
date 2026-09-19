import { getServerSession } from 'next-auth';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getPrismaClient, hasDatabaseUrl } from './prisma';
import { authOptions } from './options';
import {
  canAccessAdmin,
  canManageQuestions,
  hasPermission,
  type AdminPermission,
  type AppRole,
} from './authorization';
import { sanitizeCallbackPath } from './redirects';

type SessionIdentity = {
  id: string;
  tokenVersion: number;
};

type StoredIdentity = {
  id: string;
  role: string;
  status: string;
  tokenVersion: number;
};

export function isSessionUserCurrent(
  sessionUser: SessionIdentity,
  storedUser: StoredIdentity | null,
): storedUser is StoredIdentity {
  return (
    storedUser?.status === 'ACTIVE' &&
    storedUser.id === sessionUser.id &&
    storedUser.tokenVersion === sessionUser.tokenVersion
  );
}

export async function getCurrentSession() {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

export async function requireActiveUser(next = '/dashboard', signInPath = '/auth/sign-in') {
  const session = await getCurrentSession();
  const user = session?.user;
  const safeNext = sanitizeCallbackPath(next);

  if (!user?.id) {
    redirect(`${signInPath}?next=${encodeURIComponent(safeNext)}`);
  }

  if (!hasDatabaseUrl()) {
    redirect('/auth/sign-in?error=account');
  }

  let storedUser: StoredIdentity | null = null;
  try {
    storedUser = await getPrismaClient().user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
  } catch {
    redirect('/auth/sign-in?error=account');
  }

  if (!isSessionUserCurrent(user, storedUser)) {
    redirect('/auth/sign-in?error=session-revoked');
  }

  return {
    ...user,
    role: storedUser.role,
    status: storedUser.status,
    tokenVersion: storedUser.tokenVersion,
  };
}

export async function requireAdminConsole(next = '/admin') {
  const user = await requireActiveUser(next, '/admin/login');
  if (!canAccessAdmin(user.role)) {
    redirect('/forbidden');
  }
  return { ...user, role: user.role as AppRole };
}

export async function requireQuestionManager(next = '/questions') {
  const user = await requireActiveUser(next);
  if (!canManageQuestions(user.role)) {
    redirect('/forbidden');
  }
  return { ...user, role: user.role as 'ADMIN' | 'OWNER' };
}

export async function getOptionalAdminConsoleUser() {
  const session = await getCurrentSession();
  const user = session?.user;
  if (!user?.id || !hasDatabaseUrl()) return null;

  let storedUser: StoredIdentity | null = null;
  try {
    storedUser = await getPrismaClient().user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
  } catch {
    return null;
  }
  if (!isSessionUserCurrent(user, storedUser) || !canAccessAdmin(storedUser.role)) {
    return null;
  }

  return {
    ...user,
    role: storedUser.role as AppRole,
    status: storedUser.status,
    tokenVersion: storedUser.tokenVersion,
  };
}

export async function requirePermission(permission: AdminPermission, next = '/admin') {
  const user = await requireActiveUser(next, '/admin/login');
  if (!hasPermission(user.role, permission)) {
    redirect('/forbidden');
  }
  return { ...user, role: user.role as AppRole };
}
