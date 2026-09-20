import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authApi, MobileAuthApiError } from '../api/auth-api';
import { pendingLogoutStore } from '../notifications/pending-logout-store';
import { pushTokenStore } from '../notifications/push-token-store';
import { installationCapabilityStore } from '../notifications/installation-capability-store';
import { createLogoutCleanup } from './logout-cleanup';
import { secureSessionVault } from './secure-session-vault';
import { createSessionStore, type MobileSession } from './session-store';

type SessionMode = 'booting' | 'anonymous' | 'guest' | 'authenticated';

type SessionContextValue = {
  mode: SessionMode;
  session: MobileSession | null;
  continueAsGuest(): void;
  saveSession(session: MobileSession): Promise<void>;
  signOut(): Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const sessionStore = createSessionStore(secureSessionVault);
const logoutCleanup = createLogoutCleanup({
  store: pendingLogoutStore,
  logout: authApi.logout,
  clearPushRegistration: pushTokenStore.clearIfMatches,
});

function isTerminalRefreshFailure(error: unknown) {
  return error instanceof MobileAuthApiError && error.status === 401;
}

async function pendingLogoutFor(session: MobileSession) {
  const [registration, capability] = await Promise.all([
    pushTokenStore.getCleanupCandidate(session.user.id, session.sessionId).catch(() => null),
    installationCapabilityStore.getOrCreate().catch(() => null),
  ]);
  return {
    refreshToken: session.refreshToken,
    ownerUserId: session.user.id,
    sessionId: session.sessionId,
    expoPushToken: registration?.token ?? null,
    installationId: registration?.installationId ?? capability?.installationId ?? null,
    installationSecret: capability?.installationSecret ?? null,
    registrationRevision: registration?.revision ?? null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<SessionMode>('booting');
  const [session, setSession] = useState<MobileSession | null>(null);
  const sessionRef = useRef<MobileSession | null>(null);
  const refreshInFlight = useRef<Promise<MobileSession> | null>(null);

  useEffect(() => {
    let active = true;
    void sessionStore
      .load()
      .then(async (storedSession) => {
        const pendingLogouts = await pendingLogoutStore.list();
        const loadedSession = storedSession;
        if (
          loadedSession &&
          pendingLogouts.some(
            (pending) =>
              pending.ownerUserId === loadedSession.user.id &&
              pending.refreshToken === loadedSession.refreshToken,
          )
        ) {
          await sessionStore.clear();
          storedSession = null;
        }
        void logoutCleanup.flush();

        let stored = storedSession;
        if (stored && stored.expiresAt <= Date.now()) {
          try {
            stored = await authApi.refresh(stored.refreshToken);
            await sessionStore.save(stored);
          } catch (error) {
            if (isTerminalRefreshFailure(error)) {
              await logoutCleanup.stage(await pendingLogoutFor(stored));
              await sessionStore.clear();
              void logoutCleanup.flush();
              stored = null;
            }
          }
        }
        if (!active) return;
        sessionRef.current = stored;
        setSession(stored);
        setMode(stored ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (active) setMode('anonymous');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const expireSession = async () => {
      const refreshPromise = authApi.refresh(session.refreshToken);
      refreshInFlight.current = refreshPromise;
      try {
        const refreshed = await refreshPromise;
        if (active) {
          await sessionStore.save(refreshed);
          sessionRef.current = refreshed;
          setSession(refreshed);
        }
      } catch (error) {
        if (!active) return;
        if (isTerminalRefreshFailure(error)) {
          await logoutCleanup.stage(await pendingLogoutFor(session));
          await sessionStore.clear();
          sessionRef.current = null;
          setSession(null);
          setMode('anonymous');
          void logoutCleanup.flush();
        } else {
          timeout = setTimeout(expireSession, 30_000);
        }
      } finally {
        if (refreshInFlight.current === refreshPromise) refreshInFlight.current = null;
      }
    };
    const scheduleExpiryCheck = () => {
      const remainingMs = session.expiresAt - Date.now() - 60_000;
      if (remainingMs <= 0) {
        expireSession();
        return;
      }

      timeout = setTimeout(scheduleExpiryCheck, Math.min(remainingMs, 2_147_483_647));
    };
    scheduleExpiryCheck();

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [session]);

  const value = useMemo<SessionContextValue>(
    () => ({
      mode,
      session,
      continueAsGuest: () => setMode('guest'),
      saveSession: async (nextSession) => {
        await sessionStore.save(nextSession);
        sessionRef.current = nextSession;
        setSession(nextSession);
        setMode('authenticated');
      },
      signOut: async () => {
        await refreshInFlight.current?.catch(() => undefined);
        const currentSession = sessionRef.current ?? session;
        let cleanupStaged = false;
        if (currentSession) {
          cleanupStaged = await logoutCleanup
            .stage(await pendingLogoutFor(currentSession))
            .then(() => true)
            .catch(() => false);
        }
        await sessionStore.clear();
        sessionRef.current = null;
        setSession(null);
        setMode('anonymous');
        if (cleanupStaged) await logoutCleanup.flush();
        else if (currentSession) {
          const pending = await pendingLogoutFor(currentSession);
          const result = await authApi
            .logout(
              currentSession.refreshToken,
              pending.sessionId &&
                pending.installationId &&
                pending.installationSecret
                ? {
                    sessionId: pending.sessionId,
                    installationId: pending.installationId,
                    installationSecret: pending.installationSecret,
                    ...(pending.expoPushToken && pending.registrationRevision
                      ? {
                          expoPushToken: pending.expoPushToken,
                          registrationRevision: pending.registrationRevision,
                        }
                      : {}),
                  }
                : pending.expoPushToken
                  ? { expoPushToken: pending.expoPushToken }
                  : null,
            )
            .catch(() => null);
          if (
            result?.pushRegistrationDisabled &&
            pending.expoPushToken &&
            pending.ownerUserId &&
            pending.sessionId &&
            pending.installationId &&
            pending.registrationRevision
          )
            await pushTokenStore
              .clearIfMatches({
                token: pending.expoPushToken,
                ownerUserId: pending.ownerUserId,
                sessionId: pending.sessionId,
                installationId: pending.installationId,
                revision: pending.registrationRevision,
              })
              .catch(() => false);
        }
      },
    }),
    [mode, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}
