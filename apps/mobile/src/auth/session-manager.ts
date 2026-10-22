import { ApiError, authCallbackError, type ApiClient } from './http-client';
import type { CookieVault } from './cookie-vault';

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
  status?: string;
};
export type AuthSession = { user: SessionUser; expires: string };
export type AuthSnapshot = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: SessionUser | null;
  session: AuthSession | null;
  error: string | null;
};
export interface SessionManager {
  initialize(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshSession(): Promise<AuthSession | null>;
  getSnapshot(): AuthSnapshot;
  subscribe(listener: () => void): () => void;
}
const empty = (): AuthSnapshot => ({ status: 'unauthenticated', user: null, session: null, error: null });

export function parseSession(payload: unknown, now = Date.now()): AuthSession | null {
  if (!payload || typeof payload !== 'object') return null;
  const session = payload as { user?: unknown; expires?: unknown };
  if (!session.user || typeof session.user !== 'object' || typeof session.expires !== 'string') return null;
  const user = session.user as Record<string, unknown>;
  if (typeof user.id !== 'string' || !user.id || user.id.length > 256 ||
      !Number.isFinite(Date.parse(session.expires)) || Date.parse(session.expires) <= now ||
      (user.status !== undefined && user.status !== 'ACTIVE')) return null;
  const result: SessionUser = { id: user.id };
  for (const field of ['name', 'email', 'image'] as const) {
    if (typeof user[field] === 'string' || user[field] === null) result[field] = user[field] as string | null;
  }
  if (typeof user.role === 'string') result.role = user.role;
  if (typeof user.status === 'string') result.status = user.status;
  return { user: result, expires: session.expires };
}

export function createSessionManager(client: ApiClient, cookies: CookieVault): SessionManager {
  let snapshot: AuthSnapshot = { ...empty(), status: 'loading' };
  let generation = 0;
  let busy = false;
  let initialization: Promise<AuthSession | null> | null = null;
  let refresh: Promise<AuthSession | null> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: AuthSnapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  const authenticated = (session: AuthSession): AuthSnapshot => ({ status: 'authenticated', user: session.user, session, error: null });
  const message = (error: unknown) => error instanceof ApiError ? error.message : 'تعذّر حفظ الجلسة بأمان. حاول مجددًا.';

  client.setUnauthorizedHandler(async () => {
    generation += 1;
    try { await cookies.clear(); } finally {
      publish({ ...empty(), error: 'انتهت الجلسة. سجّل الدخول مجددًا.' });
    }
  });

  async function readSession(): Promise<AuthSession | null> {
    const payload = await client.request<unknown>('/api/auth/session');
    return parseSession(payload);
  }

  async function csrf(): Promise<string> {
    const value = await client.request<{ csrfToken?: unknown }>('/api/auth/csrf');
    if (typeof value.csrfToken !== 'string' || !/^[a-zA-Z0-9_-]{16,256}$/.test(value.csrfToken) ||
        !/(?:^|; )(?:__Host-)?next-auth\.csrf-token=/.test(cookies.header())) {
      throw new ApiError('تعذّر بدء جلسة دخول آمنة. حاول مجددًا.', 0, 'CSRF_UNAVAILABLE', 'auth-csrf');
    }
    return value.csrfToken;
  }

  async function refreshSession(): Promise<AuthSession | null> {
    if (busy) return snapshot.session;
    if (refresh) return refresh;
    const operation = generation;
    refresh = (async () => {
      try {
        await cookies.restore();
        if (!cookies.hasSession()) {
          if (operation === generation) publish(empty());
          return null;
        }
        const session = await readSession();
        if (operation !== generation) return null;
        if (!session) {
          await cookies.clear();
          publish({ ...empty(), error: 'انتهت الجلسة. سجّل الدخول مجددًا.' });
          return null;
        }
        publish(authenticated(session));
        return session;
      } catch (error) {
        if (operation === generation) {
          const current = snapshot.session && Date.parse(snapshot.session.expires) > Date.now() ? snapshot.session : null;
          publish({ ...(current ? authenticated(current) : empty()), error: message(error) });
        }
        throw error;
      }
    })().finally(() => { refresh = null; });
    return refresh;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: () => {
      if (!initialization) initialization = refreshSession().catch(() => null);
      return initialization;
    },
    refreshSession,
    signIn: async (email, password) => {
      if (busy) throw new ApiError('انتظر اكتمال العملية الحالية.', 0, 'AUTH_BUSY');
      const normalized = email.trim().toLowerCase();
      if (!normalized || normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || !password || password.length > 128) {
        throw new ApiError('أدخل البريد الإلكتروني وكلمة المرور الصحيحين.', 400, 'INVALID_CREDENTIALS');
      }
      busy = true;
      const operation = ++generation;
      publish({ ...empty(), status: 'loading' });
      try {
        // A new attempt cannot reuse a previous account's cookies.
        await cookies.clear();
        const csrfToken = await csrf();
        const result = await client.form<{ url?: unknown }>('/api/auth/callback/credentials', {
          csrfToken, email: normalized, password, callbackUrl: client.origin + '/voice', json: 'true',
        });
        // NextAuth may return HTTP 200 with a CSRF/error URL; never treat that as a successful callback.
        const callbackFailure = authCallbackError(result, client.origin, 200);
        if (callbackFailure) throw callbackFailure;
        const session = await readSession();
        if (!session || !cookies.hasSession()) {
          throw new ApiError('تعذّر إكمال جلسة تسجيل الدخول بأمان. أعد المحاولة.', 200, 'SESSION_NOT_ESTABLISHED', 'auth-session');
        }
        if (operation === generation) publish(authenticated(session));
      } catch (error) {
        if (operation === generation) {
          try { await cookies.clear(); } finally {
            publish({ ...empty(), error: message(error) });
          }
        }
        throw error;
      } finally {
        busy = false;
      }
    },
    signOut: async () => {
      if (busy) throw new ApiError('انتظر اكتمال العملية الحالية.', 0, 'AUTH_BUSY');
      busy = true;
      generation += 1;
      cookies.invalidate();
      publish({ ...snapshot, status: 'loading', error: null });
      let failure: unknown = null;
      try {
        const csrfToken = await csrf();
        await client.form('/api/auth/signout', { csrfToken, callbackUrl: client.origin + '/auth/sign-in', json: 'true' });
      } catch (error) {
        failure = error;
      } finally {
        let storageFailure: unknown = null;
        try { await cookies.clear(); } catch (error) { storageFailure = error; }
        publish({ ...empty(), error: storageFailure ? 'تعذّر حذف الجلسة المحفوظة بأمان. أعد محاولة تسجيل الخروج.' : failure ? 'تم الخروج من هذا الجهاز؛ تعذّر تأكيد طلب الخروج على الخادم.' : null });
        busy = false;
        if (storageFailure) throw new ApiError('تعذّر حذف الجلسة المحفوظة بأمان.', 0, 'SECURE_STORAGE');
      }
    },
  };
}
