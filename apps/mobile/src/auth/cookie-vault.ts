/** A private native cookie jar. Only NextAuth session cookies enter encrypted storage. */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}
type StoredCookie = { name: string; value: string; expires: number | null };
const SESSION = /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/;
const ALLOWED = /^(?:(?:__Secure-)?next-auth\.(?:session-token(?:\.\d+)?|callback-url)|(?:__Host-)?next-auth\.csrf-token)$/;
const SAFE_VALUE = /^[\x21-\x7e]*$/;

export function resolveApiOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API must be a trusted HTTPS origin without a path or credentials.');
  }
  return url.origin;
}

/** Handles combined Set-Cookie headers without splitting the comma inside Expires. */
export function splitSetCookie(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+\s*=)/).map((part) => part.trim()).filter(Boolean);
}

export class CookieVault {
  private readonly cookies = new Map<string, StoredCookie>();
  private loaded = false;
  private restoration: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private epoch = 0;
  readonly origin: string;
  private readonly key: string;

  constructor(private readonly storage: SecureStorage, origin: string, private readonly now = Date.now) {
    this.origin = resolveApiOrigin(origin);
    // SecureStore keys allow letters, digits, '.', '-' and '_'. Bind every record to its origin.
    this.key = 'tahaddi.session.v1.' + Array.from(this.origin).map((char) => char.charCodeAt(0).toString(16)).join('');
  }

  get generation(): number { return this.epoch; }

  /** Invalidate late responses, including requests made before login/logout. */
  invalidate(): void { this.epoch += 1; }

  async restore(): Promise<void> {
    if (this.loaded) return;
    if (this.restoration) return this.restoration;
    const epoch = this.epoch;
    this.restoration = (async () => {
      const raw = await this.storage.getItem(this.key);
      if (epoch !== this.epoch) return;
      if (raw) {
        let value: unknown;
        try { value = JSON.parse(raw); } catch { value = null; }
        const record = value as { version?: unknown; origin?: unknown; cookies?: unknown } | null;
        if (!record || record.version !== 1 || record.origin !== this.origin || !Array.isArray(record.cookies) || record.cookies.length > 32) {
          await this.storage.deleteItem(this.key);
        } else {
          for (const item of record.cookies) {
            if (item && typeof item === 'object' && typeof item.name === 'string' && SESSION.test(item.name) &&
                typeof item.value === 'string' && this.validValue(item.value) &&
                typeof item.expires === 'number' && Number.isFinite(item.expires) && item.expires > this.now()) {
              this.cookies.set(item.name, { name: item.name, value: item.value, expires: item.expires });
            }
          }
        }
      }
      this.loaded = true;
    })().finally(() => { this.restoration = null; });
    return this.restoration;
  }

  header(): string {
    const current = this.now();
    const entries = [...this.cookies.values()].filter((cookie) => {
      if (cookie.expires !== null && cookie.expires <= current) {
        this.cookies.delete(cookie.name);
        return false;
      }
      return true;
    });
    return entries.sort((a, b) => a.name.localeCompare(b.name)).map(({ name, value }) => name + '=' + value).join('; ');
  }

  hasSession(): boolean {
    this.header();
    return [...this.cookies.keys()].some((name) => SESSION.test(name));
  }

  async ingest(headers: string[], generation = this.epoch): Promise<void> {
    if (generation !== this.epoch) return;
    const host = new URL(this.origin).hostname;
    let sessionChanged = false;
    for (const combined of headers) {
      for (const raw of splitSetCookie(combined)) {
        const parts = raw.split(';').map((part) => part.trim());
        const first = parts.shift() ?? '';
        const equals = first.indexOf('=');
        if (equals < 1) continue;
        const name = first.slice(0, equals);
        const value = first.slice(equals + 1);
        if (!ALLOWED.test(name) || !this.validValue(value)) continue;
        const attrs = new Map<string, string>();
        for (const part of parts) {
          const split = part.indexOf('=');
          attrs.set((split < 0 ? part : part.slice(0, split)).toLowerCase(), split < 0 ? '' : part.slice(split + 1));
        }
        if ((attrs.get('domain')?.replace(/^\./, '').toLowerCase() ?? host) !== host.toLowerCase()) continue;
        if ((attrs.get('path') ?? '/') !== '/') continue;
        if (name.startsWith('__Secure-') && !attrs.has('secure')) continue;
        if (name.startsWith('__Host-') && (!attrs.has('secure') || attrs.has('domain'))) continue;
        // The session is an opaque server-issued bearer credential, never client-decoded.
        if (SESSION.test(name) && !attrs.has('httponly')) continue;
        let expires: number | null = null;
        if (attrs.has('max-age')) {
          const maxAge = attrs.get('max-age')!;
          if (!/^-?\d+$/.test(maxAge)) continue;
          expires = this.now() + Number(maxAge) * 1000;
        } else if (attrs.has('expires')) {
          expires = Date.parse(attrs.get('expires')!);
          if (!Number.isFinite(expires)) continue;
        }
        if (expires !== null && !Number.isFinite(expires)) continue;
        if (value === '' || (expires !== null && expires <= this.now())) {
          this.cookies.delete(name);
        } else {
          if (this.cookies.size >= 40 && !this.cookies.has(name)) throw new Error('Too many authentication cookies.');
          this.cookies.set(name, { name, value, expires });
        }
        if (SESSION.test(name)) sessionChanged = true;
      }
    }
    if (sessionChanged) await this.persist();
  }

  async clear(): Promise<void> {
    this.invalidate();
    this.loaded = true;
    this.cookies.clear();
    await this.enqueue(() => this.storage.deleteItem(this.key));
  }

  private validValue(value: string): boolean {
    return value.length <= 8192 && SAFE_VALUE.test(value) && !/[;,\r\n]/.test(value);
  }

  private async persist(): Promise<void> {
    const cookies = [...this.cookies.values()].filter((cookie) =>
      SESSION.test(cookie.name) && cookie.expires !== null && cookie.expires > this.now());
    const payload = JSON.stringify({ version: 1, origin: this.origin, cookies });
    if (payload.length > 65536) throw new Error('Authentication cookies exceed secure storage capacity.');
    await this.enqueue(() => cookies.length ? this.storage.setItem(this.key, payload) : this.storage.deleteItem(this.key));
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writes.catch(() => undefined).then(operation);
    this.writes = next;
    await next;
  }
}
