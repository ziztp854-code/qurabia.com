import type { MobileSession } from '../auth/session-store';
import { mobileEnvironment } from '../core/environment';
import type { InstallationCapability } from '../notifications/installation-capability';

type Fetch = typeof fetch;

type ErrorEnvelope = {
  ok: false;
  error: { code: string; message: string; requestId: string };
};

export type MobileLogoutResult = {
  signedOut: true;
  pushRegistrationDisabled: boolean;
};

export type MobileLogoutCleanup =
  | {
      expoPushToken: string;
      sessionId?: never;
      installationId?: never;
      installationSecret?: never;
      registrationRevision?: never;
    }
  | {
      sessionId: string;
      installationId: string;
      installationSecret: string;
      expoPushToken?: string;
      registrationRevision?: string;
    };

export class MobileAuthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MobileAuthApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseSession(value: unknown): MobileSession | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  if (
    typeof value.sessionId !== 'string' ||
    typeof value.accessToken !== 'string' ||
    typeof value.refreshToken !== 'string' ||
    typeof value.expiresAt !== 'number' ||
    typeof value.refreshExpiresAt !== 'number' ||
    typeof value.user.id !== 'string' ||
    typeof value.user.name !== 'string' ||
    typeof value.user.email !== 'string'
  ) {
    return null;
  }
  return {
    sessionId: value.sessionId,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
    refreshExpiresAt: value.refreshExpiresAt,
    user: {
      id: value.user.id,
      name: value.user.name,
      email: value.user.email,
      image: typeof value.user.image === 'string' ? value.user.image : null,
    },
  };
}

function parseLogoutResult(value: unknown): MobileLogoutResult | null {
  if (
    !isRecord(value) ||
    value.signedOut !== true ||
    typeof value.pushRegistrationDisabled !== 'boolean'
  ) {
    return null;
  }
  return {
    signedOut: true,
    pushRegistrationDisabled: value.pushRegistrationDisabled,
  };
}

export function createAuthApi(
  baseUrl: string,
  fetchImpl: Fetch = fetch,
  getInstallationCapability: () => Promise<InstallationCapability> = async () => {
    const { installationCapabilityStore } =
      await import('../notifications/installation-capability-store');
    return installationCapabilityStore.getOrCreate();
  },
) {
  async function post(path: string, body: unknown) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new MobileAuthApiError(
        'NETWORK_ERROR',
        'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.',
        0,
      );
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MobileAuthApiError(
        'INVALID_RESPONSE',
        'وصل رد غير صالح من الخادم.',
        response.status,
      );
    }

    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      const error =
        isRecord(payload) && isRecord(payload.error) ? (payload as ErrorEnvelope).error : null;
      throw new MobileAuthApiError(
        typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
        typeof error?.message === 'string' ? error.message : 'تعذّر إكمال الطلب الآن.',
        response.status,
      );
    }
    return payload.data;
  }

  async function sessionRequest(path: string, body: unknown) {
    const session = parseSession(await post(path, body));
    if (!session)
      throw new MobileAuthApiError('INVALID_RESPONSE', 'وصلت بيانات جلسة غير صالحة.', 0);
    return session;
  }

  return {
    signIn: async (input: { email: string; password: string }) => {
      const capability = await getInstallationCapability();
      return sessionRequest('/api/mobile/auth/sign-in', {
        ...input,
        installationId: capability.installationId,
        installationSecret: capability.installationSecret,
      });
    },
    signUp: async (input: { name: string; email: string; password: string }) => {
      const capability = await getInstallationCapability();
      return sessionRequest('/api/mobile/auth/sign-up', {
        ...input,
        installationId: capability.installationId,
        installationSecret: capability.installationSecret,
      });
    },
    refresh: (refreshToken: string) => sessionRequest('/api/mobile/auth/refresh', { refreshToken }),
    async logout(
      refreshToken: string,
      cleanup?: MobileLogoutCleanup | null,
    ) {
      const result = parseLogoutResult(
        await post('/api/mobile/auth/logout', {
          refreshToken,
          ...(cleanup ?? {}),
        }),
      );
      if (!result)
        throw new MobileAuthApiError('INVALID_RESPONSE', 'وصل رد تسجيل خروج غير صالح.', 0);
      return result;
    },
  };
}

export const authApi = createAuthApi(mobileEnvironment.apiBaseUrl);
