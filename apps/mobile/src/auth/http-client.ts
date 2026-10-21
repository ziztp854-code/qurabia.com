import { CookieVault, resolveApiOrigin } from './cookie-vault';

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'ApiError';
  }
}
export type TransportResponse = {
  status: number;
  url?: string;
  headers: { get(name: string): string | null };
  rawSetCookies?: string[];
  text(): Promise<string>;
};
export type NativeTransport = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string | FormData;
  credentials: 'omit';
  redirect: 'error';
  signal: AbortSignal;
}) => Promise<TransportResponse>;
export interface ApiClient {
  readonly origin: string;
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  form<T>(path: string, fields: Record<string, string>, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
  assetSource(uri: string): { uri: string; headers?: Record<string, string> };
  setUnauthorizedHandler(handler: (() => Promise<void>) | null): void;
}

export function createApiClient(config: {
  origin: string;
  transport: NativeTransport;
  cookies: CookieVault;
}): ApiClient {
  const origin = resolveApiOrigin(config.origin);
  if (config.cookies.origin !== origin) throw new Error('Cookie origin does not match API origin.');
  let unauthorizedHandler: (() => Promise<void>) | null = null;

  function apiUrl(path: string): string {
    if (!path.startsWith('/api/') || path.includes('\\') || /[\r\n]/.test(path)) {
      throw new ApiError('مسار API غير مسموح.', 0, 'UNTRUSTED_URL');
    }
    const url = new URL(path, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) {
      throw new ApiError('مسار API غير مسموح.', 0, 'UNTRUSTED_URL');
    }
    return url.href;
  }

  async function send<T>(path: string, options: ApiRequestOptions, form?: Record<string, string>): Promise<T> {
    const url = apiUrl(path);
    await config.cookies.restore();
    const generation = config.cookies.generation;
    const method = form ? 'POST' : options.method ?? 'GET';
    if (method === 'GET' && options.body !== undefined) throw new ApiError('GET لا يقبل بيانات كتابة.', 0, 'INVALID_REQUEST');
    const headers: Record<string, string> = { Accept: 'application/json', Origin: origin };
    const cookie = config.cookies.header();
    if (cookie) headers.Cookie = cookie;
    let body: string | FormData | undefined;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    } else if (options.body !== undefined) {
      if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }
    const timeout = options.timeoutMs ?? (method === 'GET' ? 15000 : 45000);
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 120000) {
      throw new ApiError('مهلة الطلب غير صالحة.', 0, 'INVALID_TIMEOUT');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) throw new ApiError('أُلغي الطلب.', 0, 'ABORTED');
    options.signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      // Explicit cookies + no shared OS cookie jar. Never follow a credential-bearing redirect.
      const response = await config.transport(url, { method, headers, body, credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        throw new ApiError('أعاد الخادم توجيهًا غير متوقع.', response.status, 'UNEXPECTED_REDIRECT');
      }
      if (response.url && new URL(response.url).origin !== origin) {
        throw new ApiError('مصدر استجابة غير موثوق.', 0, 'UNTRUSTED_URL');
      }
      const setCookies = response.rawSetCookies ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : []);
      await config.cookies.ingest(setCookies, generation);
      if (response.status === 401 && !path.startsWith('/api/auth/') && generation === config.cookies.generation) {
        await unauthorizedHandler?.();
      }
      const text = await response.text();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) : null; } catch {
        throw new ApiError('استجابة الخادم ليست بيانات API صالحة.', response.status, 'INVALID_RESPONSE');
      }
      if (response.status < 200 || response.status >= 300) {
        const failure = payload as { error?: unknown; code?: unknown } | null;
        const message = typeof failure?.error === 'string' ? failure.error.slice(0, 300) : 'تعذّر إتمام الطلب.';
        const code = typeof failure?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(failure.code) ? failure.code : 'REQUEST_FAILED';
        throw new ApiError(message, response.status, code);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError(timedOut ? 'انتهت مهلة الاتصال. تحقق من نتيجة العملية قبل إعادة إرسالها.' : 'أُلغي الطلب.', 0, timedOut ? 'TIMEOUT' : 'ABORTED');
      // Do not expose native network exception text: it can contain request URLs or headers.
      throw new ApiError('تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.', 0, 'NETWORK');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  return {
    origin,
    request: <T>(path: string, options: ApiRequestOptions = {}) => send<T>(path, options),
    form: <T>(path: string, fields: Record<string, string>, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => send<T>(path, { method: 'POST', ...options }, fields),
    assetSource: (value: string) => {
      if (value.includes('\\') || /[\r\n]/.test(value) || value.startsWith('//')) throw new ApiError('رابط صورة غير مسموح.', 0, 'UNTRUSTED_URL');
      const url = new URL(value, origin);
      if (url.protocol !== 'https:' || url.username || url.password) throw new ApiError('رابط صورة غير مسموح.', 0, 'UNTRUSTED_URL');
      const protectedAsset = /^\/api\/(?:voice\/emojis\/assets\/[^/]+|profile\/avatar\/[^/]+|community\/assets\/[^/]+\/[^/]+)$/.test(url.pathname);
      const cookie = url.origin === origin && protectedAsset ? config.cookies.header() : '';
      return cookie ? { uri: url.href, headers: { Cookie: cookie } } : { uri: url.href };
    },
    setUnauthorizedHandler: (handler) => { unauthorizedHandler = handler; },
  };
}
