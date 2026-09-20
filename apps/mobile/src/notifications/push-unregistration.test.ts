import assert from 'node:assert/strict';
import test from 'node:test';
import { unregisterPushRegistration } from './push-unregistration';

const registration = {
  token: `ExponentPushToken[${'a'.repeat(32)}]`,
  ownerUserId: 'user-1',
  sessionId: 'session-1',
  installationId: '11111111-1111-4111-8111-111111111111',
  revision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
const capability = {
  installationId: registration.installationId,
  installationSecret: 'a'.repeat(64),
};

test('keeps the local registration when stale server removal rejects', async () => {
  let cleared = false;

  await assert.rejects(
    unregisterPushRegistration({
      registration,
      capability,
      unregister: async () => {
        throw new Error('STALE_REGISTRATION');
      },
      clear: async () => {
        cleared = true;
        return true;
      },
    }),
    /STALE_REGISTRATION/,
  );

  assert.equal(cleared, false);
});
