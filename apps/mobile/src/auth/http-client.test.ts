import assert from 'node:assert/strict';
import test from 'node:test';
import { CookieVault, type SecureStorage } from './cookie-vault';
import { ApiError, createApiClient, type NativeTransport, type TransportResponse } from './http-client';
import { createSessionManager } from './session-manager';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const csrfToken = 'a'.repeat(64);
const expires = '2031-01-01T00:00:00.000Z';
const cookie = (value: string) => '__Secure-next-auth.session-token=' + value + '; Path=/; HttpOnly; Secure; Expires=Wed, 01 Jan 2031 00:00:00 GMT';
const session = (id: string) => ({ user: { id, status: 'ACTIVE', name: id }, expires });
const stale = (error: unknown) => error instanceof ApiError && error.code === 'STALE_SESSION';

function harness(phase: 'transport' | 'body', lateStatus = 200) {
  const records = new Map<string, string>();
  const storage: SecureStorage = {
    getItem: async (key) => records.get(key) ?? null,
    setItem: async (key, value) => { records.set(key, value); },
    deleteItem: async (key) => { records.delete(key); },
  };
  const cookies = new CookieVault(storage, 'https://test.example');
  const entered = deferred<void>();
  const releaseTransport = deferred<TransportResponse>();
  const releaseBody = deferred<string>();
  let currentId = 'old-account';
  let staleBodyRead = false;
  const response = (url: string, value: unknown, rawSetCookies: string[] = [], status = 200): TransportResponse =>
    ({ url, status, rawSetCookies, headers: { get: () => null }, text: async () => JSON.stringify(value) });
  const transport: NativeTransport = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/api/voice/rooms/late/') {
      if (phase === 'transport') {
        entered.resolve();
        return releaseTransport.promise;
      }
      return {
        url, status: lateStatus, headers: { get: () => null },
        rawSetCookies: [],
        text: () => { staleBodyRead = true; entered.resolve(); return releaseBody.promise; },
      };
    }
    if (path === '/api/auth/csrf/') {
      return response(url, { csrfToken }, ['__Host-next-auth.csrf-token=' + csrfToken + '%7Chash; Path=/; HttpOnly; Secure']);
    }
    if (path === '/api/auth/callback/credentials/') {
      currentId = new URLSearchParams(init.body as string).get('email')!.startsWith('new@') ? 'new-account' : 'old-account';
      return response(url, { url: 'https://test.example/voice' }, [cookie(currentId)]);
    }
    if (path === '/api/auth/session/') return response(url, session(currentId));
    if (path === '/api/auth/signout/') {
      return response(url, { url: 'https://test.example/auth/sign-in' }, [
        '__Secure-next-auth.session-token=; Path=/; HttpOnly; Secure; Max-Age=0',
      ]);
    }
    return response(url, { error: 'Session revoked', code: 'SESSION_REVOKED' }, [], 401);
  };
  const client = createApiClient({ origin: cookies.origin, transport, cookies });
  const manager = createSessionManager(client, cookies);
  return {
    client, cookies, manager, records, entered,
    release() {
      if (phase === 'transport') releaseTransport.resolve({
        url: 'https://test.example/api/voice/rooms/late/',
        status: lateStatus, headers: { get: () => null },
        rawSetCookies: [cookie('late-old-account-cookie')],
        text: async () => { staleBodyRead = true; return JSON.stringify(session('old-account')); },
      });
      else releaseBody.resolve(JSON.stringify(session('old-account')));
    },
    bodyWasRead: () => staleBodyRead,
  };
}

test('late transport response cannot replace cookies, return old account data or revoke the replacement account', async () => {
  for (const lateStatus of [200, 401]) {
    const h = harness('transport', lateStatus);
    await h.manager.signIn('old@example.test', 'test-only-password');
    const oldGeneration = h.client.sessionGeneration;
    const pending = h.client.request('/api/voice/rooms/late/');
    const rejection = assert.rejects(pending, stale);
    await h.entered.promise;
    await h.manager.signOut();
    await h.manager.signIn('new@example.test', 'test-only-password');
    assert.ok(h.client.sessionGeneration > oldGeneration);
    const replacementGeneration = h.client.sessionGeneration;
    h.release();
    await rejection;
    assert.equal(h.bodyWasRead(), false);
    assert.equal(h.client.sessionGeneration, replacementGeneration);
    assert.equal(h.manager.getSnapshot().status, 'authenticated');
    assert.equal(h.manager.getSnapshot().user?.id, 'new-account');
    assert.match(h.cookies.header(), /session-token=new-account/);
    assert.doesNotMatch(h.cookies.header(), /old-account/);
    assert.doesNotMatch([...h.records.values()].join(''), /old-account/);
  }
});

test('success body deferred across logout and replacement login is rejected after text resolves', async () => {
  const h = harness('body');
  await h.manager.signIn('old@example.test', 'test-only-password');
  const pending = h.client.request('/api/voice/rooms/late/');
  const rejection = assert.rejects(pending, stale);
  await h.entered.promise;
  assert.equal(h.bodyWasRead(), true);
  await h.manager.signOut();
  await h.manager.signIn('new@example.test', 'test-only-password');
  const replacementGeneration = h.client.sessionGeneration;
  h.release();
  await rejection;
  assert.equal(h.client.sessionGeneration, replacementGeneration);
  assert.equal(h.manager.getSnapshot().status, 'authenticated');
  assert.equal(h.manager.getSnapshot().user?.id, 'new-account');
  assert.match(h.cookies.header(), /session-token=new-account/);
});

test('the current response own unauthorized handler preserves its original HTTP 401', async () => {
  const h = harness('transport');
  await h.manager.signIn('old@example.test', 'test-only-password');
  const generation = h.client.sessionGeneration;
  await assert.rejects(h.client.request('/api/voice/rooms/revoked/'),
    (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === 'SESSION_REVOKED');
  assert.ok(h.client.sessionGeneration > generation);
  assert.equal(h.cookies.header(), '');
  assert.equal(h.records.size, 0);
  assert.equal(h.manager.getSnapshot().status, 'unauthenticated');
});

test('an epoch change during encrypted cookie persistence rejects that response', async () => {
  const records = new Map<string, string>();
  const entered = deferred<void>();
  const release = deferred<void>();
  let delayWrite = false;
  const storage: SecureStorage = {
    getItem: async (key) => records.get(key) ?? null,
    setItem: async (key, value) => {
      if (delayWrite) { delayWrite = false; entered.resolve(); await release.promise; }
      records.set(key, value);
    },
    deleteItem: async (key) => { records.delete(key); },
  };
  const cookies = new CookieVault(storage, 'https://test.example');
  await cookies.restore();
  await cookies.ingest([cookie('old-account')]);
  const client = createApiClient({
    origin: cookies.origin, cookies,
    transport: async (url) => ({
      url, status: 200, headers: { get: () => null }, rawSetCookies: [cookie('rotated-old-account')],
      text: async () => JSON.stringify(session('old-account')),
    }),
  });
  delayWrite = true;
  const pending = client.request('/api/voice/rooms/late/');
  const rejection = assert.rejects(pending, stale);
  await entered.promise;
  // Invalidation is synchronous, so the previous response is stale even while its write drains.
  cookies.invalidate();
  const replacement = cookies.ingest([cookie('new-account')]);
  release.resolve();
  await replacement;
  await rejection;
  assert.match(cookies.header(), /session-token=new-account/);
  assert.doesNotMatch([...records.values()].join(''), /old-account/);
});


test('extensionless GET and credentials POST use canonical URLs before an unchanged query', async () => {
  const calls: { url: string; init: Parameters<NativeTransport>[1] }[] = [];
  const cookies = new CookieVault({
    getItem: async () => null, setItem: async () => {}, deleteItem: async () => {},
  }, 'https://test.example');
  const client = createApiClient({
    origin: cookies.origin, cookies,
    transport: async (url, init) => {
      calls.push({ url, init });
      return { url, status: 200, headers: { get: () => null }, text: async () => '{"ok":true}' };
    },
  });
  await client.request('/api/auth/session');
  await client.form('/api/auth/callback/credentials?next=%2Fvoice&attempt=1', {
    csrfToken, email: 'member@example.test', password: 'test-only-password', json: 'true',
  });
  await client.request('/api/voice/rooms/id/events?cursor=a%2Fb&take=50', {
    method: 'POST', body: { type: 'mute', muted: true },
  });
  await client.request('/api/auth/session/?check=1');
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://test.example/api/auth/session/',
    'https://test.example/api/auth/callback/credentials/?next=%2Fvoice&attempt=1',
    'https://test.example/api/voice/rooms/id/events/?cursor=a%2Fb&take=50',
    'https://test.example/api/auth/session/?check=1',
  ]);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(new URLSearchParams(calls[1].init.body as string).get('csrfToken'), csrfToken);
  for (const { init } of calls) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Origin, 'https://test.example');
  }
});

test('Next file-like API paths keep no trailing slash while unusual dotted segments are unchanged', async () => {
  const urls: string[] = [];
  const cookies = new CookieVault({
    getItem: async () => null, setItem: async () => {}, deleteItem: async () => {},
  }, 'https://test.example');
  const client = createApiClient({
    origin: cookies.origin, cookies,
    transport: async (url) => {
      urls.push(url);
      return { url, status: 200, headers: { get: () => null }, text: async () => '{}' };
    },
  });
  await client.request('/api/export.json');
  await client.request('/api/export.json/?download=1');
  await client.request('/api/voice/rooms/name.other-id?still=1');
  assert.deepEqual(urls, [
    'https://test.example/api/export.json',
    'https://test.example/api/export.json?download=1',
    'https://test.example/api/voice/rooms/name.other-id?still=1',
  ]);
});

test('only known same-origin protected asset URLs are canonicalized and receive a cookie', async () => {
  const cookies = new CookieVault({
    getItem: async () => null, setItem: async () => {}, deleteItem: async () => {},
  }, 'https://test.example');
  await cookies.restore();
  await cookies.ingest([cookie('current-account')]);
  const client = createApiClient({
    origin: cookies.origin, cookies,
    transport: async () => { throw new Error('assetSource must not issue an API request'); },
  });
  const emoji = client.assetSource('/api/voice/emojis/assets/id?still=1');
  assert.equal(emoji.uri, 'https://test.example/api/voice/emojis/assets/id/?still=1');
  assert.match(emoji.headers?.Cookie ?? '', /session-token=current-account/);
  assert.equal(client.assetSource('/api/profile/avatar/id/').uri, 'https://test.example/api/profile/avatar/id/');
  assert.equal(client.assetSource('/api/community/assets/avatar/photo.webp/').uri, 'https://test.example/api/community/assets/avatar/photo.webp');
  assert.deepEqual(client.assetSource('/voice/covers/public.webp'), { uri: 'https://test.example/voice/covers/public.webp' });
  assert.deepEqual(client.assetSource('https://cdn.test.example/api/voice/emojis/assets/id?still=1'), {
    uri: 'https://cdn.test.example/api/voice/emojis/assets/id?still=1',
  });
});

test('canonicalization does not follow or allow even a same-origin redirect response', async () => {
  const cookies = new CookieVault({
    getItem: async () => null, setItem: async () => {}, deleteItem: async () => {},
  }, 'https://test.example');
  let calls = 0;
  const client = createApiClient({
    origin: cookies.origin, cookies,
    transport: async (url, init) => {
      calls += 1;
      assert.equal(url, 'https://test.example/api/auth/session/');
      assert.equal(init.redirect, 'error');
      return { url, status: 308, headers: { get: (name) => name === 'location' ? 'https://test.example/elsewhere/' : null }, text: async () => '{}' };
    },
  });
  await assert.rejects(client.request('/api/auth/session'),
    (error: unknown) => error instanceof ApiError && error.code === 'UNEXPECTED_REDIRECT');
  assert.equal(calls, 1);
});
