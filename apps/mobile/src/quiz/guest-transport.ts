import { CookieVault, resolveApiOrigin } from '../auth/cookie-vault';
import { createApiClient, type NativeTransport } from '../auth/http-client';

/** No account cookies, persistence, response cookies, or account unauthorized handler. */
export function createGuestQuizClient(originValue: string, transport: NativeTransport) {
  const origin = resolveApiOrigin(originValue);
  const emptyVault = new CookieVault({
    getItem: async () => null, setItem: async () => {}, deleteItem: async () => {},
  }, origin);
  return createApiClient({ origin, cookies: emptyVault, transport: async (url, init) => {
    const response = await transport(url, init);
    return { ...response, headers: { get: () => null }, rawSetCookies: [] };
  } });
}
