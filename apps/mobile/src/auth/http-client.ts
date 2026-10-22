import { CookieVault, resolveApiOrigin } from './cookie-vault';

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};
export type ApiStage = 'api' | 'auth-csrf' | 'auth-callback' | 'auth-session' | 'auth-signout';
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'REQUEST_FAILED', readonly stage: ApiStage = 'api') {
    super(message);
    this.name = 'ApiError';
  }
}
/** Only protocol-defined auth failures are safe to expose; callback URLs are never followed or echoed. */
export function authCallbackError(payload: unknown, origin: string, status: number): ApiError | null {
  const stage: ApiStage = 'auth-callback';
  const invalid = () => new ApiError('استجابة دخول غير صالحة.', status, 'INVALID_RESPONSE', stage);
  if (status >= 500) return new ApiError('تعذّر تسجيل الدخول من الخادم. حاول لاحقًا.', status, 'AUTH_SERVER_ERROR', stage);
  if (status === 429) return new ApiError('محاولات دخول كثيرة. انتظر قليلًا ثم أعد المحاولة.', status, 'RATE_LIMITED', stage);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return invalid();
  const value = payload as { url?: unknown };
  if (typeof value.url !== 'string' || !value.url.trim() || value.url.length > 4096) return invalid();
  let callback: URL;
  try { callback = new URL(value.url, origin); } catch { return invalid(); }
  if (callback.origin !== origin || callback.username || callback.password) return invalid();
  if (callback.searchParams.get('csrf') === 'true')
    return new ApiError('تعذّر التحقق من طلب الدخول الآمن. أعد المحاولة.', status, 'AUTH_CSRF_REJECTED', stage);
  if (!callback.searchParams.has('error')) return null;
  switch (callback.searchParams.get('error')) {
    case 'CredentialsSignin':
      return new ApiError('تعذّر قبول بيانات الدخول. راجع البريد وكلمة المرور ثم أعد المحاولة.', status, 'INVALID_CREDENTIALS', stage);
    case 'AccessDenied':
      return new ApiError('هذا الحساب غير متاح لتسجيل الدخول حاليًا.', status, 'AUTH_ACCESS_DENIED', stage);
    default:
      // authorize() may throw an internal message; never leak it through the URL query.
      return new ApiError('تعذّر تسجيل الدخول من الخادم. حاول لاحقًا.', status, 'AUTH_SERVER_ERROR', stage);
  }
}

function requestStage(pathname: string): ApiStage {
  switch (pathname.replace(/\/$/, '')) {
    case '/api/auth/csrf': return 'auth-csrf';
    case '/api/auth/callback/credentials': return 'auth-callback';
    case '/api/auth/session': return 'auth-session';
    case '/api/auth/signout': return 'auth-signout';
    default: return 'api';
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
  readonly sessionGeneration: number;
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  form<T>(path: string, fields: Record<string, string>, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
  assetSource(uri: string): { uri: string; headers?: Record<string, string> };
  setUnauthorizedHandler(handler: (() => Promise<void>) | null): void;
}

/** Match next.config trailingSlash:true without following redirects or changing query data. */
function canonicalApiPathname(pathname: string): string {
  const untrailed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const leaf = untrailed.slice(untrailed.lastIndexOf('/') + 1);
  // Next adds a slash to extensionless paths, removes one from .word file paths,
  // and leaves other dotted segments alone.
  if (leaf && !leaf.includes('.')) return untrailed + '/';
  if (/\.\w+$/.test(leaf)) return untrailed;
  return pathname;
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
    url.pathname = canonicalApiPathname(url.pathname);
    return url.href;
  }

  async function send<T>(path: string, options: ApiRequestOptions, form?: Record<string, string>): Promise<T> {
    const url = apiUrl(path);
    const stage = requestStage(new URL(url).pathname);
    await config.cookies.restore();
    const generation = config.cookies.generation;
    const requireCurrentSession = () => {
      if (generation !== config.cookies.generation) throw new ApiError('تغيّرت الجلسة. أعد العملية من الحساب الحالي.', 0, 'STALE_SESSION', stage);
    };
    const method = form ? 'POST' : options.method ?? 'GET';
    if (method === 'GET' && options.body !== undefined) throw new ApiError('GET لا يقبل بيانات كتابة.', 0, 'INVALID_REQUEST', stage);
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
      throw new ApiError('مهلة الطلب غير صالحة.', 0, 'INVALID_TIMEOUT', stage);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) throw new ApiError('أُلغي الطلب.', 0, 'ABORTED', stage);
    options.signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      // Explicit cookies + no shared OS cookie jar. Never follow a credential-bearing redirect.
      const response = await config.transport(url, { method, headers, body, credentials: 'omit', redirect: 'error', signal: controller.signal });
      requireCurrentSession();
      if (response.status >= 300 && response.status < 400) {
        throw new ApiError('أعاد الخادم توجيهًا غير متوقع.', response.status, 'UNEXPECTED_REDIRECT', stage);
      }
      if (response.url && new URL(response.url).origin !== origin) {
        throw new ApiError('مصدر استجابة غير موثوق.', 0, 'UNTRUSTED_URL', stage);
      }
      const setCookies = response.rawSetCookies ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : []);
      await config.cookies.ingest(setCookies, generation);
      requireCurrentSession();
      const revokedByThisResponse = response.status === 401 && !path.startsWith('/api/auth/') && unauthorizedHandler !== null;
      if (revokedByThisResponse) await unauthorizedHandler!();
      const text = await response.text();
      // This response's own 401 intentionally invalidates the jar; preserve that original error.
      // Every other response must still belong to the account that initiated the request.
      if (!revokedByThisResponse) requireCurrentSession();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) : null; } catch {
        throw new ApiError('استجابة الخادم ليست بيانات API صالحة.', response.status, 'INVALID_RESPONSE', stage);
      }
      if (response.status < 200 || response.status >= 300) {
        if (stage === 'auth-callback' && method === 'POST') {
          const failure = authCallbackError(payload, origin, response.status);
          if (failure) throw failure;
          // A failing HTTP status with a success-looking URL is not authenticated.
          throw new ApiError('تعذّر تسجيل الدخول من الخادم. حاول لاحقًا.', response.status, 'AUTH_SERVER_ERROR', stage);
        }
        const failure = payload as { error?: unknown; code?: unknown } | null;
        const message = typeof failure?.error === 'string' ? failure.error.slice(0, 300) : 'تعذّر إتمام الطلب.';
        const code = typeof failure?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(failure.code) ? failure.code : 'REQUEST_FAILED';
        throw new ApiError(message, response.status, code, stage);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError(timedOut ? 'انتهت مهلة الاتصال. تحقق من نتيجة العملية قبل إعادة إرسالها.' : 'أُلغي الطلب.', 0, timedOut ? 'TIMEOUT' : 'ABORTED', stage);
      // Do not expose native network exception text: it can contain request URLs or headers.
      throw new ApiError('تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.', 0, 'NETWORK', stage);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  return {
    origin,
    get sessionGeneration() { return config.cookies.generation; },
    request: <T>(path: string, options: ApiRequestOptions = {}) => send<T>(path, options),
    form: <T>(path: string, fields: Record<string, string>, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => send<T>(path, { method: 'POST', ...options }, fields),
    assetSource: (value: string) => {
      if (value.includes('\\') || /[\r\n]/.test(value) || value.startsWith('//')) throw new ApiError('رابط صورة غير مسموح.', 0, 'UNTRUSTED_URL');
      const url = new URL(value, origin);
      if (url.protocol !== 'https:' || url.username || url.password) throw new ApiError('رابط صورة غير مسموح.', 0, 'UNTRUSTED_URL');
      const assetPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
      const protectedAsset = /^\/api\/(?:voice\/emojis\/assets\/[^/]+|profile\/avatar\/[^/]+|community\/assets\/[^/]+\/[^/]+)$/.test(assetPath);
      if (url.origin === origin && protectedAsset) url.pathname = canonicalApiPathname(url.pathname);
      const cookie = url.origin === origin && protectedAsset ? config.cookies.header() : '';
      return cookie ? { uri: url.href, headers: { Cookie: cookie } } : { uri: url.href };
    },
    setUnauthorizedHandler: (handler) => { unauthorizedHandler = handler; },
  };
}
