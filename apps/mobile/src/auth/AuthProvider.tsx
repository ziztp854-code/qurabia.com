import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { apiClient, sessionCookies } from '../api/client';
import { createSessionManager, type AuthSnapshot, type SessionManager } from './session-manager';
import type { ApiClient } from './http-client';

export type { AuthSession, SessionUser, AuthSnapshot } from './session-manager';
type AuthContextValue = AuthSnapshot & {
  client: ApiClient;
  signIn: SessionManager['signIn'];
  signOut: SessionManager['signOut'];
  refreshSession: SessionManager['refreshSession'];
};
export const authSession = createSessionManager(apiClient, sessionCookies);
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(authSession.subscribe, authSession.getSnapshot, authSession.getSnapshot);
  useEffect(() => {
    void authSession.initialize();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void authSession.refreshSession().catch(() => undefined);
    });
    // Revalidate revocation/expiry while foregrounded; no background polling or retained password.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void authSession.refreshSession().catch(() => undefined);
    }, 60000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    ...snapshot,
    client: apiClient,
    signIn: authSession.signIn,
    signOut: authSession.signOut,
    refreshSession: authSession.refreshSession,
  }), [snapshot]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be inside AuthProvider.');
  return value;
}
