import { mobileEnvironment } from '../core/environment';

export type PushDeviceRegistration = {
  expoPushToken: string;
  sessionId: string;
  platform: 'ios' | 'android';
  deviceName: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  installationId: string;
  installationSecret: string;
  registrationRevision: string;
  previousRegistrationRevision?: string | null;
  previousExpoPushToken?: string | null;
};

async function deviceRequest(
  method: 'POST' | 'DELETE',
  accessToken: string,
  body:
    | PushDeviceRegistration
    | {
        expoPushToken: string;
        installationId: string;
        installationSecret: string;
        registrationRevision: string;
      },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${mobileEnvironment.apiBaseUrl}/api/mobile/notifications/devices`,
      {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error &&
        typeof payload.error === 'object' &&
        'message' in payload.error &&
        typeof payload.error.message === 'string'
          ? payload.error.message
          : 'تعذّر تحديث إعدادات الإشعارات.';
      throw new Error(message);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') throw error;
    throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.');
  } finally {
    clearTimeout(timeout);
  }
}

export const notificationsApi = {
  register: async (accessToken: string, input: PushDeviceRegistration) => {
    const payload = await deviceRequest('POST', accessToken, input);
    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : null;
    if (
      !data ||
      typeof data !== 'object' ||
      !('registrationRevision' in data) ||
      typeof data.registrationRevision !== 'string'
    ) {
      throw new Error('وصل رد غير صالح عند تسجيل الإشعارات.');
    }
    return { registrationRevision: data.registrationRevision };
  },
  unregister: (
    accessToken: string,
    input: {
      expoPushToken: string;
      installationId: string;
      installationSecret: string;
      registrationRevision: string;
    },
  ) => deviceRequest('DELETE', accessToken, input),
};
