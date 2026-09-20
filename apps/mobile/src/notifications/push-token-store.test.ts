import assert from 'node:assert/strict';
import test from 'node:test';
import { createPushRegistrationStore, type PushRegistrationVault } from './push-registration-store';

function memoryVault(): PushRegistrationVault & {
  value: string | null;
  setCalls: number;
  failSetAt: number;
} {
  return {
    value: null,
    setCalls: 0,
    failSetAt: -1,
    async get() {
      return this.value;
    },
    async set(value) {
      this.setCalls += 1;
      if (this.setCalls === this.failSetAt) throw new Error('secure store unavailable');
      this.value = value;
    },
    async remove() {
      this.value = null;
    },
  };
}

const capability = {
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecret: 'a'.repeat(64),
};
const token = ['ExponentPushToken[', 'a'.repeat(20), ']'].join('');
const revisionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const revisionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('writes a durable pending intent before contacting the server', async () => {
  const vault = memoryVault();
  const store = createPushRegistrationStore(vault, () => revisionA);
  let observedState: unknown;

  await store.reconcileRegistration(token, 'user-a', 'session-a', capability, async (input) => {
    observedState = JSON.parse(vault.value!);
    return { registrationRevision: input.registrationRevision };
  });

  assert.deepEqual(observedState, {
    committed: null,
    pending: {
      token,
      ownerUserId: 'user-a',
      sessionId: 'session-a',
      installationId: capability.installationId,
      revision: revisionA,
    },
  });
});

test('retries a lost server response with the same durable revision', async () => {
  const vault = memoryVault();
  const revisions = [revisionA, revisionB];
  const store = createPushRegistrationStore(vault, () => revisions.shift()!);
  const attempted: string[] = [];
  const register = async (input: { registrationRevision: string }) => {
    attempted.push(input.registrationRevision);
    if (attempted.length === 1) throw new Error('response lost after commit');
    return { registrationRevision: input.registrationRevision };
  };

  await assert.rejects(
    store.reconcileRegistration(token, 'user-a', 'session-a', capability, register),
  );
  await store.reconcileRegistration(token, 'user-a', 'session-a', capability, register);

  assert.deepEqual(attempted, [revisionA, revisionA]);
  assert.equal((await store.getRegistration())?.revision, revisionA);
});

test('keeps the pending intent when SecureStore fails after server success', async () => {
  const vault = memoryVault();
  vault.failSetAt = 2;
  const store = createPushRegistrationStore(vault, () => revisionA);

  await assert.rejects(
    store.reconcileRegistration(token, 'user-a', 'session-a', capability, async (input) => ({
      registrationRevision: input.registrationRevision,
    })),
  );

  const persisted = JSON.parse(vault.value!);
  assert.equal(persisted.pending.revision, revisionA);
  assert.equal(persisted.committed, null);
});

test('a new login creates a newer revision and stale cleanup cannot clear it locally', async () => {
  const vault = memoryVault();
  const revisions = [revisionA, revisionB];
  const store = createPushRegistrationStore(vault, () => revisions.shift()!);
  const first = await store.reconcileRegistration(
    token,
    'user-a',
    'session-a',
    capability,
    async (input) => ({ registrationRevision: input.registrationRevision }),
  );
  let secondRequest: { previousRegistrationRevision: string | null } | null = null;
  const current = await store.reconcileRegistration(
    token,
    'user-a',
    'session-b',
    capability,
    async (input) => {
      secondRequest = input;
      return { registrationRevision: input.registrationRevision };
    },
  );

  assert.equal(first.revision, revisionA);
  assert.equal(current.revision, revisionB);
  assert.equal(secondRequest?.previousRegistrationRevision, revisionA);
  assert.equal(await store.clearIfMatches(first), false);
  assert.deepEqual(await store.getRegistration(), current);
});
