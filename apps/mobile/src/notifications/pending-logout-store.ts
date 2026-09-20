import * as SecureStore from 'expo-secure-store';
import type { PendingLogout, PendingLogoutStore } from '../auth/logout-cleanup';

const PENDING_LOGOUT_KEY = 'tahaddi.mobile.pending-push-logout.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const expoPushTokenPattern = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{20,200}\]$/;
const installationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const installationSecretPattern = /^[a-f0-9]{64}$/;

function isPendingLogout(value: unknown): value is PendingLogout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pending = value as Record<string, unknown>;
  return (
    typeof pending.refreshToken === 'string' &&
    pending.refreshToken.length >= 40 &&
    pending.refreshToken.length <= 256 &&
    (pending.ownerUserId === null ||
      (typeof pending.ownerUserId === 'string' &&
        pending.ownerUserId.length > 0 &&
        pending.ownerUserId.length <= 128)) &&
    (pending.sessionId === null ||
      (typeof pending.sessionId === 'string' &&
        pending.sessionId.length > 0 &&
        pending.sessionId.length <= 128)) &&
    (pending.expoPushToken === null ||
      (typeof pending.expoPushToken === 'string' &&
        expoPushTokenPattern.test(pending.expoPushToken))) &&
    (pending.installationId === null ||
      (typeof pending.installationId === 'string' &&
        installationIdPattern.test(pending.installationId))) &&
    (pending.installationSecret === null ||
      (typeof pending.installationSecret === 'string' &&
        installationSecretPattern.test(pending.installationSecret))) &&
    (pending.registrationRevision === null ||
      (typeof pending.registrationRevision === 'string' &&
        pending.registrationRevision.length > 0 &&
        pending.registrationRevision.length <= 128))
  );
}

function parsePendingLogouts(serialized: string | null): PendingLogout[] {
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    if (Array.isArray(value)) {
      const normalized = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? {
              sessionId: null,
              installationId: null,
              installationSecret: null,
              ...item,
            }
          : item,
      );
      return normalized.every(isPendingLogout) ? normalized : [];
    }
    if (value && typeof value === 'object') {
      const legacy = value as Record<string, unknown>;
      if (
        typeof legacy.refreshToken === 'string' &&
        legacy.refreshToken.length >= 40 &&
        legacy.refreshToken.length <= 256 &&
        (legacy.expoPushToken === null ||
          (typeof legacy.expoPushToken === 'string' &&
            expoPushTokenPattern.test(legacy.expoPushToken)))
      ) {
        return [
          {
            refreshToken: legacy.refreshToken,
            ownerUserId: null,
            sessionId: null,
            expoPushToken: legacy.expoPushToken,
            installationId: null,
            installationSecret: null,
            registrationRevision: null,
          },
        ];
      }
    }
    return [];
  } catch {
    return [];
  }
}

async function readPendingLogouts() {
  const serialized = await SecureStore.getItemAsync(PENDING_LOGOUT_KEY, secureOptions);
  const pending = parsePendingLogouts(serialized);
  if (pending.length === 0 && serialized)
    await SecureStore.deleteItemAsync(PENDING_LOGOUT_KEY, secureOptions);
  return pending;
}

let serial: Promise<unknown> = Promise.resolve();
function exclusively<T>(operation: () => Promise<T>) {
  const result = serial.then(operation, operation);
  serial = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export const pendingLogoutStore: PendingLogoutStore = {
  list: () => exclusively(readPendingLogouts),
  put: (value) =>
    exclusively(async () => {
      const current = await readPendingLogouts();
      const next = [...current.filter((item) => item.refreshToken !== value.refreshToken), value];
      await SecureStore.setItemAsync(PENDING_LOGOUT_KEY, JSON.stringify(next), secureOptions);
    }),
  remove: (refreshToken) =>
    exclusively(async () => {
      const current = await readPendingLogouts();
      const next = current.filter((item) => item.refreshToken !== refreshToken);
      if (next.length === 0) {
        await SecureStore.deleteItemAsync(PENDING_LOGOUT_KEY, secureOptions);
        return;
      }
      await SecureStore.setItemAsync(PENDING_LOGOUT_KEY, JSON.stringify(next), secureOptions);
    }),
};
