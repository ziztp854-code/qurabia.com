import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogoutCleanup, type PendingLogout, type PendingLogoutStore } from './logout-cleanup';
import type { PushRegistration } from '../notifications/push-token-store';

function memoryPendingStore(): PendingLogoutStore & { values: PendingLogout[] } {
  return {
    values: [],
    async list() {
      return [...this.values];
    },
    async put(value) {
      this.values = [
        ...this.values.filter((item) => item.refreshToken !== value.refreshToken),
        value,
      ];
    },
    async remove(refreshToken) {
      this.values = this.values.filter((item) => item.refreshToken !== refreshToken);
    },
  };
}

const pending = {
  refreshToken: 'refresh-token-that-is-long-enough-for-the-api-contract',
  ownerUserId: 'user-a',
  sessionId: 'session-a',
  expoPushToken: `ExponentPushToken[${'a'.repeat(32)}]`,
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecret: 'a'.repeat(64),
  registrationRevision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

test('retains the authenticated logout tombstone until server-side push cleanup is confirmed', async () => {
  const store = memoryPendingStore();
  const clearedPushTokens: string[] = [];
  const cleanup = createLogoutCleanup({
    store,
    logout: async () => ({ signedOut: true, pushRegistrationDisabled: false }),
    clearPushRegistration: async () => {
      clearedPushTokens.push('cleared');
      return true;
    },
  });

  await cleanup.stage(pending);
  assert.equal(await cleanup.flush(), false);
  assert.deepEqual(store.values, [pending]);
  assert.deepEqual(clearedPushTokens, []);
});

test('clears the tombstone and local push token only after the server confirms cleanup', async () => {
  const store = memoryPendingStore();
  const logoutCalls: unknown[] = [];
  let pushTokenCleared = false;
  const cleanup = createLogoutCleanup({
    store,
    logout: async (refreshToken, cleanup) => {
      logoutCalls.push({ refreshToken, cleanup });
      return { signedOut: true, pushRegistrationDisabled: true };
    },
    clearPushRegistration: async () => {
      pushTokenCleared = true;
      return true;
    },
  });

  await cleanup.stage(pending);
  assert.equal(await cleanup.flush(), true);
  assert.deepEqual(logoutCalls, [
    {
      refreshToken: pending.refreshToken,
      cleanup: {
        sessionId: pending.sessionId,
        expoPushToken: pending.expoPushToken,
        installationId: pending.installationId,
        installationSecret: pending.installationSecret,
        registrationRevision: pending.registrationRevision,
      },
    },
  ]);
  assert.deepEqual(store.values, []);
  assert.equal(pushTokenCleared, true);
});

test('uses the installation capability to revoke a rotated session without a push token', async () => {
  const store = memoryPendingStore();
  const logoutCalls: unknown[] = [];
  const cleanup = createLogoutCleanup({
    store,
    logout: async (refreshToken, capability) => {
      logoutCalls.push({ refreshToken, capability });
      return { signedOut: true, pushRegistrationDisabled: true };
    },
    clearPushRegistration: async () => true,
  });
  const withoutPush = { ...pending, expoPushToken: null, registrationRevision: null };

  await cleanup.stage(withoutPush);
  assert.equal(await cleanup.flush(), true);
  assert.deepEqual(logoutCalls, [
    {
      refreshToken: pending.refreshToken,
      capability: {
        sessionId: pending.sessionId,
        installationId: pending.installationId,
        installationSecret: pending.installationSecret,
      },
    },
  ]);
});

test('keeps the tombstone when the logout request is offline so boot can retry it', async () => {
  const store = memoryPendingStore();
  const cleanup = createLogoutCleanup({
    store,
    logout: async () => {
      throw new Error('offline');
    },
    clearPushRegistration: async () => true,
  });

  await cleanup.stage(pending);
  assert.equal(await cleanup.flush(), false);
  assert.deepEqual(store.values, [pending]);
});

test('an offline logout for A cannot clear B registration, while B logout clears its own revision', async () => {
  const store = memoryPendingStore();
  let current: PushRegistration | null = {
    token: pending.expoPushToken,
    ownerUserId: 'user-a',
    sessionId: 'session-a',
    installationId: pending.installationId,
    revision: pending.registrationRevision,
  };
  const cleanup = createLogoutCleanup({
    store,
    logout: async () => ({ signedOut: true, pushRegistrationDisabled: true }),
    clearPushRegistration: async (expected) => {
      if (
        current?.token !== expected.token ||
        current.ownerUserId !== expected.ownerUserId ||
        current.revision !== expected.revision
      )
        return false;
      current = null;
      return true;
    },
  });

  await cleanup.stage(pending);
  current = {
    token: `ExponentPushToken[${'b'.repeat(32)}]`,
    ownerUserId: 'user-b',
    sessionId: 'session-b',
    installationId: pending.installationId,
    revision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  };

  assert.equal(await cleanup.flush(), true);
  assert.equal(current.ownerUserId, 'user-b');

  await cleanup.stage({
    refreshToken: 'refresh-token-for-user-b-that-is-long-enough',
    ownerUserId: current.ownerUserId,
    sessionId: current.sessionId,
    expoPushToken: current.token,
    installationId: current.installationId,
    installationSecret: pending.installationSecret,
    registrationRevision: current.revision,
  });
  assert.equal(await cleanup.flush(), true);
  assert.equal(current, null);
});
