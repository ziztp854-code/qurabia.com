import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMobileEnvironment } from './environment';

test('uses the public Tahaddi services when no development overrides are present', () => {
  assert.deepEqual(resolveMobileEnvironment({}), {
    apiBaseUrl: 'https://qurabia.com',
    realtimeUrl: 'https://realtime.qurabia.com',
    universalLinkBaseUrl: 'https://qurabia.com',
  });
});

test('accepts explicit HTTP localhost endpoints for local native development', () => {
  assert.deepEqual(
    resolveMobileEnvironment(
      {
        EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000/',
        EXPO_PUBLIC_REALTIME_URL: 'http://127.0.0.1:3001/',
      },
      { allowInsecureLocalhost: true },
    ),
    {
      apiBaseUrl: 'http://127.0.0.1:3000',
      realtimeUrl: 'http://127.0.0.1:3001',
      universalLinkBaseUrl: 'https://qurabia.com',
    },
  );
});

test('rejects insecure remote endpoints even in local development mode', () => {
  assert.throws(
    () =>
      resolveMobileEnvironment(
        { EXPO_PUBLIC_API_URL: 'http://api.example.com' },
        { allowInsecureLocalhost: true },
      ),
    /EXPO_PUBLIC_API_URL/,
  );
});

test('rejects endpoints that are not HTTP origins', () => {
  assert.throws(
    () => resolveMobileEnvironment({ EXPO_PUBLIC_API_URL: 'file:///private/account.json' }),
    /EXPO_PUBLIC_API_URL/,
  );
});
