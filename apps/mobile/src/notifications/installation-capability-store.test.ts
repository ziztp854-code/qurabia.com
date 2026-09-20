import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInstallationCapabilityStore,
  type InstallationCapabilityVault,
} from './installation-capability';

test('creates one cryptographic installation capability and reuses the atomic record', async () => {
  let value: string | null = null;
  let generated = 0;
  const vault: InstallationCapabilityVault = {
    get: async () => value,
    set: async (next) => {
      value = next;
    },
  };
  const expected = {
    installationId: '11111111-1111-4111-8111-111111111111',
    installationSecret: 'a'.repeat(64),
  };
  const store = createInstallationCapabilityStore(vault, async () => {
    generated += 1;
    return expected;
  });

  const [first, second] = await Promise.all([store.getOrCreate(), store.getOrCreate()]);

  assert.deepEqual(first, expected);
  assert.deepEqual(second, expected);
  assert.equal(generated, 1);
  assert.equal(value, JSON.stringify(expected));
});
