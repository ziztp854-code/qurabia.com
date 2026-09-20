import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthApi, MobileAuthApiError } from './auth-api';

const session = {
  sessionId: 'session-1',
  accessToken: 'access',
  refreshToken: 'refresh-token-that-is-long-enough-for-the-api-contract',
  expiresAt: 2_000_000_000_000,
  refreshExpiresAt: 2_100_000_000_000,
  user: { id: 'user-1', name: 'مها', email: 'maha@example.com', image: null },
};
const capability = {
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecret: 'a'.repeat(64),
};
const getCapability = async () => capability;
const validPassphrase = ['Strong', 'Pass', '123'].join('');
const invalidPassphrase = ['wrong', 'password'].join('-');

test('posts credentials to the mobile auth endpoint and parses the session envelope', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createAuthApi(
    'https://qurabia.com',
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, data: session, requestId: 'request-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    getCapability,
  );

  assert.deepEqual(
    await api.signIn({ email: 'maha@example.com', password: validPassphrase }),
    session,
  );
  assert.equal(calls[0]?.url, 'https://qurabia.com/api/mobile/auth/sign-in');
  assert.equal(calls[0]?.init?.method, 'POST');
});

test('surfaces the safe Arabic API error without exposing response internals', async () => {
  const api = createAuthApi(
    'https://qurabia.com',
    async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'تعذّر تسجيل الدخول.',
            requestId: 'request-2',
          },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    getCapability,
  );

  await assert.rejects(
    api.signIn({ email: 'maha@example.com', password: invalidPassphrase }),
    (error: unknown) =>
      error instanceof MobileAuthApiError &&
      error.code === 'INVALID_CREDENTIALS' &&
      error.message === 'تعذّر تسجيل الدخول.',
  );
});

test('uses the native session endpoints for sign-up, refresh rotation, and logout', async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const api = createAuthApi(
    'https://qurabia.com',
    async (url, init) => {
      const body = JSON.parse(String(init?.body)) as unknown;
      calls.push({ url: String(url), body });
      const isLogout = String(url).endsWith('/logout');
      return Response.json({
        ok: true,
        data: isLogout ? { signedOut: true, pushRegistrationDisabled: true } : session,
      });
    },
    getCapability,
  );

  assert.deepEqual(
    await api.signUp({ name: 'مها', email: 'maha@example.com', password: validPassphrase }),
    session,
  );
  assert.deepEqual(await api.refresh(session.refreshToken), session);
  const cleanup = {
    sessionId: session.sessionId,
    expoPushToken: `ExponentPushToken[${'a'.repeat(32)}]`,
    installationId: capability.installationId,
    installationSecret: capability.installationSecret,
    registrationRevision: '22222222-2222-4222-8222-222222222222',
  };
  assert.deepEqual(await api.logout(session.refreshToken, cleanup), {
    signedOut: true,
    pushRegistrationDisabled: true,
  });

  assert.deepEqual(calls, [
    {
      url: 'https://qurabia.com/api/mobile/auth/sign-up',
      body: {
        name: 'مها',
        email: 'maha@example.com',
        password: validPassphrase,
        installationId: capability.installationId,
        installationSecret: capability.installationSecret,
      },
    },
    {
      url: 'https://qurabia.com/api/mobile/auth/refresh',
      body: { refreshToken: session.refreshToken },
    },
    {
      url: 'https://qurabia.com/api/mobile/auth/logout',
      body: {
        refreshToken: session.refreshToken,
        ...cleanup,
      },
    },
  ]);
});
