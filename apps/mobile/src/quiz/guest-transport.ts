import { CookieVault, resolveApiOrigin } from '../auth/cookie-vault';
import { readAnswerRejectionReason } from './live-room';
import { createApiClient, type NativeTransport } from '../auth/http-client';

/** No account cookies, persistence, response cookies, or account unauthorized handler. */
export function createGuestQuizClient(originValue: string, transport: NativeTransport) {
  const origin = resolveApiOrigin(originValue);
  const emptyVault = new CookieVault({
    getItem: async () => null, setItem: async () => {}, deleteItem: async () => {},
  }, origin);
  return createApiClient({ origin, cookies: emptyVault, transport: async (url, init) => {
    const response = await transport(url, init);
    return { ...response, headers: { get: () => null }, rawSetCookies: [], text: async () => {
      const text = await response.text();
      if (response.status === 409) {
        try {
          const value: unknown = JSON.parse(text);
          const reason = readAnswerRejectionReason(
            value && typeof value === 'object' ? (value as { reason?: unknown }).reason : null);
          if (reason) return JSON.stringify({ error: 'تعذّر قبول الإجابة.', code: reason });
        } catch { /* The shared HTTP client still rejects malformed JSON. */ }
      }
      return text;
    } };
  } });
}
