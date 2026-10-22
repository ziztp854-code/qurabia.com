import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { CookieVault, resolveApiOrigin } from '../auth/cookie-vault';
import { createApiClient, type NativeTransport } from '../auth/http-client';

export { ApiError, createApiClient } from '../auth/http-client';
export type { ApiClient, ApiRequestOptions, NativeTransport, TransportResponse } from '../auth/http-client';

// Build configuration only. Incoming links never select an API origin.
export const API_ORIGIN = resolveApiOrigin(process.env.EXPO_PUBLIC_API_URL || 'https://qurabia.com');
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'com.qurabia.tahaddi.session',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export const sessionCookies = new CookieVault({
  getItem: (key) => SecureStore.getItemAsync(key, secureOptions),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, secureOptions),
  deleteItem: (key) => SecureStore.deleteItemAsync(key, secureOptions),
}, API_ORIGIN);

const nativeTransport: NativeTransport = async (url, init) => {
  const response = await expoFetch(url, init);
  // Expo exposes the native header pairs, preserving separate Set-Cookie lines and HttpOnly.
  // The public Headers fallback accommodates implementations with getSetCookie support.
  const raw = (response as unknown as { _rawHeaders?: [string, string][] })._rawHeaders;
  const cookieHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const rawSetCookies = Array.isArray(raw)
    ? raw.filter(([name]) => name.toLowerCase() === 'set-cookie').map(([, value]) => value)
    : cookieHeaders.getSetCookie?.();
  return { status: response.status, url: response.url, headers: response.headers, rawSetCookies, text: () => response.text() };
};

export const apiClient = createApiClient({ origin: API_ORIGIN, transport: nativeTransport, cookies: sessionCookies });
export const apiRequest = apiClient.request;
