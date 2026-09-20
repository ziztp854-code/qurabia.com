import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionStore, type SessionVault } from './session-store';

function memoryVault(initialValue: string | null = null): SessionVault & { value: string | null } {
  return {
    value: initialValue,
    async get() {
      return this.value;
    },
    async set(value) {
      this.value = value;
    },
    async remove() {
      this.value = null;
    },
  };
}

test('persists and restores the authenticated mobile session through the vault seam', async () => {
  const vault = memoryVault();
  const store = createSessionStore(vault);
  const session = {
    sessionId: 'session-1',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: 2_000_000_000_000,
    refreshExpiresAt: 2_100_000_000_000,
    user: { id: 'user-1', name: 'مها', email: 'maha@example.com' },
  };

  await store.save(session);

  assert.deepEqual(await store.load(), session);
});

test('removes malformed session data instead of exposing it to the app', async () => {
  const vault = memoryVault('{"accessToken":42}');
  const store = createSessionStore(vault);

  assert.equal(await store.load(), null);
  assert.equal(vault.value, null);
});

test('clears the complete session from the vault', async () => {
  const vault = memoryVault('{"accessToken":"old"}');

  await createSessionStore(vault).clear();

  assert.equal(vault.value, null);
});

test('refuses to persist an already expired session', async () => {
  const vault = memoryVault();
  const store = createSessionStore(vault);

  await assert.rejects(
    store.save({
      sessionId: 'session-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 1,
      refreshExpiresAt: 1,
      user: { id: 'user-1', name: 'مها', email: 'maha@example.com' },
    }),
    /valid mobile session/,
  );
  assert.equal(vault.value, null);
});

test('keeps a refreshable session when only its access token is expired', async () => {
  const session = {
    sessionId: 'session-1',
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
    expiresAt: 1,
    refreshExpiresAt: 2_100_000_000_000,
    user: { id: 'user-1', name: 'مها', email: 'maha@example.com' },
  };
  const vault = memoryVault(JSON.stringify(session));

  assert.deepEqual(await createSessionStore(vault).load(), session);
});
