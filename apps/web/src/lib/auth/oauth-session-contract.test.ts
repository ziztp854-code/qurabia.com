import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { NextAuthOptions } from 'next-auth';
import { encode, decode, type JWT, type JWTOptions } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ findUnique: vi.fn() }));
// Only the application's database boundary is mocked; NextAuth/JOSE run unchanged.
vi.mock('./prisma', () => ({
  hasDatabaseUrl: () => true,
  getPrismaClient: () => ({ user: { findUnique: database.findUnique } }),
}));
import { authOptions } from './options';

// JOSE's Node crypto must receive Node typed arrays rather than jsdom's realm.
vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);

type Cookie = {
  name: string; value: string;
  options: { httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string;
    maxAge?: number; expires?: Date };
};
type ProtocolOptions = {
  provider: { id: string; checks: string[] };
  cookies: Record<string, Omit<Cookie, 'value'>>;
  jwt: JWTOptions;
  callbacks: { redirect: (params: { url: string; baseUrl: string }) => Promise<string> | string };
};
type Response = { status?: number; body?: unknown; redirect?: string; cookies?: Cookie[] };
type Request = {
  action: string; method: 'GET' | 'POST'; cookies: Record<string, string>;
  body?: Record<string, string>; query?: Record<string, string>;
  headers: Record<string, string>;
};
type Check = {
  create: (options: ProtocolOptions, cookies: Cookie[], params: Record<string, string>) => Promise<void>;
  use: (cookies: Record<string, string>, cleared: Cookie[], options: ProtocolOptions,
    checks: Record<string, string>) => Promise<void>;
};

// Resolve private entry points from the locked installed package, not exported facsimiles.
const require = createRequire(import.meta.url);
const libraryRoot = path.dirname(require.resolve('next-auth'));
const { AuthHandler } = require(path.join(libraryRoot, 'core/index.js')) as {
  AuthHandler: (params: { req: Request; options: NextAuthOptions }) => Promise<Response>;
};
const { init } = require(path.join(libraryRoot, 'core/init.js')) as {
  init: (params: { authOptions: NextAuthOptions; providerId: string; action: string;
    origin: string; cookies: Record<string, string> }) => Promise<{ options: ProtocolOptions }>;
};
const { state, pkce } = require(path.join(libraryRoot, 'core/lib/oauth/checks.js')) as {
  state: Check; pkce: Check;
};
const { SessionStore } = require(path.join(libraryRoot, 'core/lib/cookie.js')) as {
  SessionStore: new (cookie: Omit<Cookie, 'value'>, req: { cookies: Record<string, string> },
    logger: { debug: () => void }) => { chunk: (token: string) => Cookie[] };
};

const secret = randomUUID();
const origin = 'https://auth.example.test';
const identity = {
  id: 'protocol-user', name: 'Protocol User', email: 'protocol@example.test',
  picture: 'https://images.example.test/avatar.png', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 4,
};

function fixtureOptions(): NextAuthOptions {
  return {
    ...authOptions, secret,
    providers: [GoogleProvider({ clientId: 'fixture-google-id', clientSecret: 'fixture-google-secret' })],
    logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  };
}

async function protocolOptions(cookies: Record<string, string> = {}) {
  return (await init({ authOptions: fixtureOptions(), providerId: 'google',
    action: 'callback', origin, cookies })).options;
}

function request(action: string, cookies: Record<string, string> = {}, body?: Record<string, string>) {
  return AuthHandler({ options: fixtureOptions(), req: {
    action, method: body ? 'POST' : 'GET', cookies, body,
    headers: { host: 'auth.example.test', 'x-forwarded-proto': 'https' },
  } });
}

function signedSession(overrides: JWT = {}, maxAge = 3600) {
  return encode({ secret, maxAge, token: {
    ...identity, sub: identity.id, ...overrides,
    access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token',
    id_token: 'fixture-provider-id-token',
  } });
}

function tamper(token: string) {
  const parts = token.split('.');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  return parts.join('.');
}

function cookieJar(cookies: Cookie[]) {
  return Object.fromEntries(cookies.map(cookie => [cookie.name, cookie.value]));
}

beforeEach(() => {
  database.findUnique.mockReset().mockResolvedValue(identity);
  vi.stubEnv('NEXTAUTH_URL', origin);
  vi.stubEnv('AUTH_TRUST_HOST', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('locked NextAuth session endpoint', () => {
  it('runs the expected 4.24.15 library', () => {
    expect(require(path.join(libraryRoot, 'package.json')).version).toBe('4.24.15');
  });

  it('returns the current identity without any provider tokens', async () => {
    const options = await protocolOptions();
    const result = await request('session', {
      [options.cookies.sessionToken.name]: await signedSession(),
    });
    expect(result.body).toMatchObject({ user: {
      id: identity.id, email: identity.email, name: identity.name, image: identity.picture,
      role: 'ADMIN', status: 'ACTIVE', tokenVersion: 4,
    } });
    const exposed = JSON.stringify(result.body);
    for (const token of ['fixture-access-token', 'fixture-refresh-token', 'fixture-provider-id-token']) {
      expect(exposed).not.toContain(token);
    }
    expect(exposed).not.toMatch(/access_token|refresh_token|id_token/);
    expect(database.findUnique).toHaveBeenCalled();
  });

  it('returns anonymous without a cookie and does not query the database', async () => {
    expect((await request('session')).body).toEqual({});
    expect(database.findUnique).not.toHaveBeenCalled();
  });

  it.each(['tampered', 'expired', 'stale', 'missing-id', 'mismatched-subject'])(
    'returns anonymous and clears an invalid %s session', async invalid => {
      const options = await protocolOptions();
      const cookieName = options.cookies.sessionToken.name;
      const token = invalid === 'tampered' ? tamper(await signedSession())
        : await signedSession(invalid === 'stale' ? { tokenVersion: 3 }
          : invalid === 'missing-id' ? { id: undefined }
          : invalid === 'mismatched-subject' ? { sub: 'different-user' } : {},
        invalid === 'expired' ? -120 : 3600);
      const result = await request('session', { [cookieName]: token });
      expect(result.body).toEqual({});
      expect(result.cookies).toContainEqual(expect.objectContaining({
        name: cookieName, value: '', options: expect.objectContaining({ maxAge: 0 }),
      }));
    },
  );

  it.each(['SUSPENDED', 'DELETED'])('returns anonymous for a currently %s user', async status => {
    database.findUnique.mockResolvedValue({ ...identity, status });
    const options = await protocolOptions();
    expect((await request('session', {
      [options.cookies.sessionToken.name]: await signedSession(),
    })).body).toEqual({});
  });
});

describe('locked NextAuth signout endpoint', () => {
  it('validates real secret-bound CSRF and clears every session chunk', async () => {
    const options = await protocolOptions();
    const store = new SessionStore(options.cookies.sessionToken, { cookies: {} }, { debug: () => {} });
    const chunks = store.chunk(await signedSession({ padding: 'x'.repeat(7000) }));
    expect(chunks.length).toBeGreaterThan(1);
    const csrf = await request('csrf');
    const body = csrf.body as { csrfToken: string };
    const result = await request('signout', { ...cookieJar(csrf.cookies ?? []), ...cookieJar(chunks) }, {
      csrfToken: body.csrfToken, callbackUrl: '/auth/sign-in',
    });
    expect(result.redirect).toBe(`${origin}/auth/sign-in`);
    for (const chunk of chunks) {
      expect(result.cookies).toContainEqual(expect.objectContaining({
        name: chunk.name, value: '', options: expect.objectContaining({ maxAge: 0 }),
      }));
    }
  });

  it.each(['absent', 'wrong-body', 'wrong-secret'])('rejects %s CSRF without clearing the session', async invalid => {
    const options = await protocolOptions();
    const name = options.cookies.sessionToken.name;
    const csrf = await request('csrf');
    const body = csrf.body as { csrfToken: string };
    const cookies = cookieJar(csrf.cookies ?? []);
    let submittedToken = body.csrfToken;
    if (invalid === 'absent') delete cookies[options.cookies.csrfToken.name];
    if (invalid === 'wrong-secret') {
      // Ask the library for a CSRF cookie under a different local fixture secret.
      const other = await AuthHandler({ options: { ...fixtureOptions(), secret: randomUUID() },
        req: { action: 'csrf', method: 'GET', cookies: {}, headers: { host: 'auth.example.test' } } });
      cookies[options.cookies.csrfToken.name] = cookieJar(other.cookies ?? [])[options.cookies.csrfToken.name];
      submittedToken = (other.body as { csrfToken: string }).csrfToken;
    }
    const result = await request('signout', { ...cookies, [name]: await signedSession() }, {
      csrfToken: invalid === 'wrong-body' ? 'incorrect-fixture-token' : submittedToken,
    });
    expect(result.redirect).toBe(`${origin}/api/auth/signout?csrf=true`);
    expect(result.cookies?.some(cookie => cookie.name.startsWith(name))).toBe(false);
    expect(database.findUnique).not.toHaveBeenCalled();
  });
});

describe('locked Google OAuth state and PKCE', () => {
  it('preserves Google defaults and HTTPS cookie protection', async () => {
    const options = await protocolOptions();
    expect(options.provider.checks).toEqual(['pkce', 'state']);
    for (const key of ['sessionToken', 'csrfToken', 'callbackUrl', 'state', 'pkceCodeVerifier']) {
      expect(options.cookies[key].options).toMatchObject({
        secure: true, httpOnly: true, sameSite: 'lax', path: '/',
      });
    }
    for (const key of ['state', 'pkceCodeVerifier']) {
      expect(options.cookies[key].options.maxAge).toBe(900);
    }
  });

  it.each([['state', state, 'state'], ['pkceCodeVerifier', pkce, 'code_verifier']] as const)(
    'authenticates and consumes the %s cookie with its provider binding', async (key, check, outputKey) => {
      const options = await protocolOptions();
      const cookies: Cookie[] = [];
      const parameters: Record<string, string> = {};
      await check.create(options, cookies, parameters);
      const cookie = cookies.find(value => value.name === options.cookies[key].name)!;
      const decoded = await decode({ ...options.jwt, token: cookie.value, salt: cookie.name });
      expect(decoded?.provider).toBe('google');
      expect(Number(decoded?.exp) - Number(decoded?.iat)).toBe(900);
      const checks: Record<string, string> = {};
      const cleared: Cookie[] = [];
      await check.use(cookieJar(cookies), cleared, options, checks);
      expect(checks[outputKey]).toBe(decoded?.value);
      expect(cleared).toContainEqual(expect.objectContaining({
        name: cookie.name, value: '', options: expect.objectContaining({ maxAge: 0 }),
      }));
      if (key === 'state') expect(checks.state).toBe(parameters.state);
      else expect(parameters).toMatchObject({ code_challenge_method: 'S256', code_challenge: expect.any(String) });
    },
  );

  it.each([['state', state], ['pkceCodeVerifier', pkce]] as const)(
    'rejects missing, tampered and other-provider %s cookies', async (key, check) => {
      const options = await protocolOptions();
      await expect(check.use({}, [], options, {})).rejects.toThrow(/missing/);
      const cookies: Cookie[] = [];
      await check.create(options, cookies, {});
      const name = options.cookies[key].name;
      await expect(check.use({ [name]: tamper(cookieJar(cookies)[name]) }, [], options, {})).rejects.toThrow();
      const foreignCookies: Cookie[] = [];
      await check.create({ ...options, provider: { ...options.provider, id: 'other-provider' } }, foreignCookies, {});
      await expect(check.use(cookieJar(foreignCookies), [], options, {})).rejects.toThrow(/different provider/);
    },
  );
});

describe('locked NextAuth redirect defaults', () => {
  it('allows local redirects and rejects external redirect and callback-cookie targets', async () => {
    const options = await protocolOptions();
    expect(await options.callbacks.redirect({ url: '/mamluk', baseUrl: origin })).toBe(`${origin}/mamluk`);
    expect(await options.callbacks.redirect({ url: `${origin}/account`, baseUrl: origin })).toBe(`${origin}/account`);
    expect(await options.callbacks.redirect({ url: 'https://external.example.test/', baseUrl: origin })).toBe(origin);
    const cookieOptions = await protocolOptions({
      [options.cookies.callbackUrl.name]: 'https://external.example.test/',
    });
    expect(cookieOptions).toMatchObject({ callbackUrl: origin });
  });
});
