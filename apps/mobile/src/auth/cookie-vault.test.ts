import assert from 'node:assert/strict';
import test from 'node:test';
import { CookieVault, resolveApiOrigin, splitSetCookie, type SecureStorage } from './cookie-vault';

function memory() {
  const data = new Map<string, string>();
  const storage: SecureStorage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
    deleteItem: async (key) => { data.delete(key); },
  };
  return { data, storage };
}
const future = 'Wed, 01 Jan 2031 00:00:00 GMT';
const sessionCookie = (value: string, suffix = '') => '__Secure-next-auth.session-token' + suffix + '=' + value + '; Path=/; Secure; HttpOnly; Expires=' + future;

test('only trusted HTTPS origins without URL credentials or paths are accepted', () => {
  assert.equal(resolveApiOrigin('https://test.example/'), 'https://test.example');
  for (const url of ['http://test.example', 'https://user:pass@test.example', 'https://test.example/api', 'https://test.example/?token=x', 'https://test.example/#x']) {
    assert.throws(() => resolveApiOrigin(url));
  }
});

test('combined Set-Cookie headers preserve the Expires comma', () => {
  const values = splitSetCookie(sessionCookie('partA', '.0') + ', ' + sessionCookie('partB', '.1'));
  assert.equal(values.length, 2);
  assert.ok(values[0].includes('Wed, 01 Jan'));
});

test('encrypted persistence contains session chunks only, not CSRF or callback cookies', async () => {
  const { data, storage } = memory();
  const jar = new CookieVault(storage, 'https://test.example');
  await jar.restore();
  await jar.ingest([
    '__Host-next-auth.csrf-token=csrf%7Chash; Path=/; HttpOnly; Secure',
    '__Secure-next-auth.callback-url=https%3A%2F%2Ftest.example%2Fvoice; Path=/; Secure',
    sessionCookie('partA', '.0'), sessionCookie('partB', '.1'),
  ]);
  assert.match(jar.header(), /csrf-token=/);
  const persisted = [...data.values()].join('');
  assert.match(persisted, /partA/);
  assert.doesNotMatch(persisted, /csrf|callback-url/);
  const restored = new CookieVault(storage, 'https://test.example');
  await restored.restore();
  assert.match(restored.header(), /session-token\.0=partA/);
  assert.match(restored.header(), /session-token\.1=partB/);
  assert.doesNotMatch(restored.header(), /csrf|callback/);
});

test('foreign, insecure prefixed, non-HttpOnly and unrelated cookies cannot become sessions', async () => {
  const { storage, data } = memory();
  const jar = new CookieVault(storage, 'https://test.example');
  await jar.ingest([
    sessionCookie('foreign') + '; Domain=evil.example',
    '__Secure-next-auth.session-token=bad; Path=/; HttpOnly; Expires=' + future,
    '__Secure-next-auth.session-token=bad; Path=/; Secure; Expires=' + future,
    'unrelated=value; Path=/; HttpOnly; Secure; Expires=' + future,
  ]);
  assert.equal(jar.header(), '');
  assert.equal(data.size, 0);
});

test('logout invalidates in-flight cookie rotation and deletes the encrypted record', async () => {
  const { storage, data } = memory();
  const jar = new CookieVault(storage, 'https://test.example');
  await jar.ingest([sessionCookie('before')]);
  const beforeLogout = jar.generation;
  await jar.clear();
  await jar.ingest([sessionCookie('late-response')], beforeLogout);
  assert.equal(jar.header(), '');
  assert.equal(data.size, 0);
});

test('Max-Age takes precedence over Expires and deleted/expired cookies cannot survive restore', async () => {
  const { storage, data } = memory();
  let clock = Date.parse('2026-10-22T00:00:00Z');
  const jar = new CookieVault(storage, 'https://test.example', () => clock);
  await jar.ingest([sessionCookie('short') + '; Max-Age=1']);
  assert.ok(jar.hasSession());
  clock += 1001;
  assert.equal(jar.hasSession(), false);
  const restored = new CookieVault(storage, 'https://test.example', () => clock);
  await restored.restore();
  assert.equal(restored.hasSession(), false);
  await jar.ingest([sessionCookie('deleted') + '; Max-Age=0']);
  assert.equal(data.size, 0);
});

test('sessions for one configured origin are never restored for another', async () => {
  const { storage } = memory();
  const first = new CookieVault(storage, 'https://one.example');
  await first.ingest([sessionCookie('private')]);
  const other = new CookieVault(storage, 'https://two.example');
  await other.restore();
  assert.equal(other.header(), '');
});
