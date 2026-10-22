import assert from 'node:assert/strict';
import test from 'node:test';
import { CookieVault, type SecureStorage } from './cookie-vault';
import { ApiError, createApiClient, type NativeTransport } from './http-client';
import { createSessionManager, parseSession } from './session-manager';

const csrfToken = 'a'.repeat(64);
const expires = '2031-01-01T00:00:00.000Z';
const cookie = '__Secure-next-auth.session-token=opaque-encrypted-session; Path=/; Secure; HttpOnly; Expires=Wed, 01 Jan 2031 00:00:00 GMT';
const session = { user: { id: 'real-server-id', name: 'عضو', email: 'member@example.test', status: 'ACTIVE', role: 'USER' }, expires };
function setup(options: { failLogout?: boolean; callback?: string; csrfCookie?: boolean; revoked?: boolean } = {}) {
  const data = new Map<string, string>();
  const storage: SecureStorage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
    deleteItem: async (key) => { data.delete(key); },
  };
  const jar = new CookieVault(storage, 'https://test.example');
  const requests: { path: string; init: Parameters<NativeTransport>[1] }[] = [];
  const transport: NativeTransport = async (url, init) => {
    const path = new URL(url).pathname;
    requests.push({ path, init });
    assert.equal(init.headers.Origin, 'https://test.example');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    let payload: unknown;
    let cookies: string[] = [];
    let status = 200;
    if (path === '/api/auth/csrf/') {
      payload = { csrfToken };
      if (options.csrfCookie !== false) cookies = ['__Host-next-auth.csrf-token=' + csrfToken + '%7Chash; Path=/; Secure; HttpOnly'];
    } else if (path === '/api/auth/callback/credentials/') {
      const form = new URLSearchParams(init.body as string);
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(form.get('csrfToken'), csrfToken);
      assert.equal(form.get('email'), 'member@example.test');
      assert.equal(form.get('password'), 'test-only-password');
      assert.match(init.headers.Cookie, /csrf-token=/);
      assert.equal(form.get('json'), 'true');
      assert.equal(form.get('callbackUrl'), 'https://test.example/voice');
      payload = { url: options.callback ?? 'https://test.example/voice' };
      cookies = [cookie];
    } else if (path === '/api/auth/session/') {
      assert.match(init.headers.Cookie, /session-token=opaque-encrypted-session/);
      payload = options.revoked ? {} : session;
    } else if (path === '/api/auth/signout/') {
      if (options.failLogout) throw new Error('network is offline');
      assert.match(init.headers.Cookie, /session-token=/);
      assert.equal(new URLSearchParams(init.body as string).get('csrfToken'), csrfToken);
      payload = { url: 'https://test.example/auth/sign-in' };
      cookies = ['__Secure-next-auth.session-token=; Path=/; Secure; HttpOnly; Max-Age=0'];
    } else {
      status = 401;
      payload = { code: 'SESSION_REVOKED', error: 'Session expired' };
    }
    return { status, url, headers: { get: () => null }, rawSetCookies: cookies, text: async () => JSON.stringify(payload) };
  };
  const client = createApiClient({ origin: 'https://test.example', transport, cookies: jar });
  return { manager: createSessionManager(client, jar), client, jar, data, requests };
}

test('credentials protocol sends CSRF cookie + form, validates server session and securely persists only opaque session', async () => {
  const { manager, requests, data } = setup();
  await manager.initialize();
  assert.equal(manager.getSnapshot().status, 'unauthenticated');
  await manager.signIn(' MEMBER@example.test ', 'test-only-password');
  assert.equal(manager.getSnapshot().user?.id, session.user.id);
  assert.equal(manager.getSnapshot().status, 'authenticated');
  assert.deepEqual(requests.map((request) => request.path), ['/api/auth/csrf/', '/api/auth/callback/credentials/', '/api/auth/session/']);
  assert.doesNotMatch([...data.values()].join(''), /test-only-password|csrf-token|member@example/);
});

test('missing CSRF response cookie fails closed before posting credentials', async () => {
  const { manager, requests, data } = setup({ csrfCookie: false });
  await assert.rejects(manager.signIn('member@example.test', 'test-only-password'), (error: unknown) => error instanceof ApiError && error.code === 'CSRF_UNAVAILABLE');
  assert.deepEqual(requests.map((request) => request.path), ['/api/auth/csrf/']);
  assert.equal(manager.getSnapshot().status, 'unauthenticated');
  assert.equal(data.size, 0);
});

test('foreign callback and credentials error redirects never authenticate', async () => {
  for (const callback of ['https://evil.example/voice', 'https://test.example/auth/sign-in?error=CredentialsSignin']) {
    const { manager, jar, data } = setup({ callback });
    await assert.rejects(manager.signIn('member@example.test', 'test-only-password'));
    assert.equal(manager.getSnapshot().user, null);
    assert.equal(jar.header(), '');
    assert.equal(data.size, 0);
  }
});

test('revoked session cannot authenticate even when a session cookie was returned', async () => {
  const { manager, jar } = setup({ revoked: true });
  await assert.rejects(manager.signIn('member@example.test', 'test-only-password'));
  assert.equal(manager.getSnapshot().status, 'unauthenticated');
  assert.equal(jar.hasSession(), false);
});

test('logout posts CSRF and clears local encrypted session even when the server is unreachable', async () => {
  for (const failLogout of [false, true]) {
    const { manager, jar, data, requests } = setup({ failLogout });
    await manager.signIn('member@example.test', 'test-only-password');
    await manager.signOut();
    assert.ok(requests.some((request) => request.path === '/api/auth/signout/'));
    assert.equal(manager.getSnapshot().status, 'unauthenticated');
    assert.equal(jar.header(), '');
    assert.equal(data.size, 0);
    if (failLogout) assert.ok(manager.getSnapshot().error);
  }
});

test('authenticated API 401 clears credentials and forces reauthentication', async () => {
  const { manager, client, jar, data } = setup();
  await manager.signIn('member@example.test', 'test-only-password');
  await assert.rejects(client.request('/api/voice/rooms/'), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(manager.getSnapshot().status, 'unauthenticated');
  assert.equal(jar.header(), '');
  assert.equal(data.size, 0);
});

test('expired or disabled session identities are rejected without decoding credentials', () => {
  assert.equal(parseSession({ ...session, expires: '2020-01-01T00:00:00Z' }), null);
  assert.equal(parseSession({ ...session, user: { ...session.user, status: 'SUSPENDED' } }), null);
  assert.equal(parseSession({ ...session, user: { name: 'missing id' } }), null);
  assert.equal(parseSession({}), null);
});
