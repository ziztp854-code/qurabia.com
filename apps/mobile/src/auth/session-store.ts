export type MobileUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type MobileSession = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
  user: MobileUser;
};

export type SessionVault = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMobileSession(value: unknown): value is MobileSession {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  return (
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof value.refreshToken === 'string' &&
    value.refreshToken.length > 0 &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) &&
    typeof value.refreshExpiresAt === 'number' &&
    Number.isFinite(value.refreshExpiresAt) &&
    typeof value.user.id === 'string' &&
    typeof value.user.name === 'string' &&
    typeof value.user.email === 'string'
  );
}

function isUsableMobileSession(value: unknown): value is MobileSession {
  return isMobileSession(value) && value.refreshExpiresAt > Date.now();
}

export function createSessionStore(vault: SessionVault) {
  return {
    async load() {
      const serialized = await vault.get();
      if (!serialized) return null;

      try {
        const parsed: unknown = JSON.parse(serialized);
        if (isUsableMobileSession(parsed)) return parsed;
      } catch {
        // Corrupt keychain data is treated as a signed-out session.
      }

      await vault.remove();
      return null;
    },
    async save(session: MobileSession) {
      if (!isUsableMobileSession(session)) {
        throw new Error('Expected a valid mobile session with a future expiry.');
      }
      await vault.set(JSON.stringify(session));
    },
    async clear() {
      await vault.remove();
    },
  };
}
