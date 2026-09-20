import type { MobileLogoutCleanup, MobileLogoutResult } from '../api/auth-api';
import type { PushRegistration } from '../notifications/push-registration-store';

export type PendingLogout = {
  refreshToken: string;
  ownerUserId: string | null;
  sessionId: string | null;
  expoPushToken: string | null;
  installationId: string | null;
  installationSecret: string | null;
  registrationRevision: string | null;
};

export type PendingLogoutStore = {
  list(): Promise<PendingLogout[]>;
  put(value: PendingLogout): Promise<void>;
  remove(refreshToken: string): Promise<void>;
};

type LogoutCleanupDependencies = {
  store: PendingLogoutStore;
  logout(
    refreshToken: string,
    cleanup?: MobileLogoutCleanup | null,
  ): Promise<MobileLogoutResult>;
  clearPushRegistration(expected: PushRegistration): Promise<boolean>;
};

export function createLogoutCleanup(dependencies: LogoutCleanupDependencies) {
  return {
    stage: (pending: PendingLogout) => dependencies.store.put(pending),
    async flush() {
      const pendingLogouts = await dependencies.store.list();
      let completed = true;
      for (const pending of pendingLogouts) {
        try {
          const hasCapability =
            pending.sessionId && pending.installationId && pending.installationSecret;
          const hasPushCleanup = pending.expoPushToken && pending.registrationRevision;
          const result = await dependencies.logout(
            pending.refreshToken,
            hasCapability
              ? {
                  sessionId: pending.sessionId!,
                  installationId: pending.installationId!,
                  installationSecret: pending.installationSecret!,
                  ...(hasPushCleanup
                    ? {
                        expoPushToken: pending.expoPushToken!,
                        registrationRevision: pending.registrationRevision!,
                      }
                    : {}),
                }
              : pending.expoPushToken
                ? { expoPushToken: pending.expoPushToken }
                : null,
          );
          if (!result.pushRegistrationDisabled) {
            completed = false;
            continue;
          }
          if (
            pending.expoPushToken &&
            pending.ownerUserId &&
            pending.sessionId &&
            pending.installationId &&
            pending.registrationRevision
          ) {
            await dependencies.clearPushRegistration({
              token: pending.expoPushToken,
              ownerUserId: pending.ownerUserId,
              sessionId: pending.sessionId,
              installationId: pending.installationId,
              revision: pending.registrationRevision,
            });
          }
          await dependencies.store.remove(pending.refreshToken);
        } catch {
          completed = false;
        }
      }
      return completed;
    },
  };
}
