import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../auth/http-client';
import { presentConnectionError, presentLoginError, presentSessionNotice } from './auth-error';

test('login failures retain distinct safe recovery categories', () => {
  const examples = [
    ['INVALID_CREDENTIALS', 401, 'credentials'], ['AUTH_ACCESS_DENIED', 403, 'access-denied'],
    ['NETWORK', 0, 'network'], ['TIMEOUT', 0, 'timeout'], ['AUTH_SERVER_ERROR', 500, 'server'],
    ['REQUEST_FAILED', 503, 'server'], ['RATE_LIMITED', 429, 'rate-limit'],
    ['AUTH_CSRF_REJECTED', 200, 'csrf'], ['CSRF_UNAVAILABLE', 0, 'csrf'],
    ['SESSION_NOT_ESTABLISHED', 200, 'session'], ['STALE_SESSION', 0, 'session'],
    ['SECURE_STORAGE', 0, 'storage'], ['INVALID_RESPONSE', 200, 'protocol'],
    ['UNEXPECTED_REDIRECT', 307, 'protocol'], ['UNTRUSTED_URL', 0, 'protocol'],
    ['ABORTED', 0, 'cancelled'], ['AUTH_BUSY', 0, 'busy'],
  ] as const;
  for (const [code, status, kind] of examples) {
    const result = presentLoginError(new ApiError('Untrusted error payload', status, code));
    assert.equal(result.kind, kind, code);
    assert.ok(result.message.length > 0, code);
    assert.ok(!result.message.includes('Untrusted'), code);
  }
});

test('unknown unauthorized and infrastructure failures do not claim a bad password', () => {
  assert.equal(presentLoginError(new ApiError('CredentialsSignin', 401)).kind, 'unknown');
  assert.equal(presentLoginError(new ApiError('password rejected', 500, 'INVALID_CREDENTIALS')).kind, 'server');
  const rejection = presentLoginError(new ApiError('', 401, 'INVALID_CREDENTIALS'));
  assert.match(rejection.message, /لم يقبل الخادم/);
  assert.doesNotMatch(rejection.message, /كلمة المرور خاطئة/);
  const localValidation = presentLoginError(new ApiError('', 400, 'INVALID_CREDENTIALS'));
  assert.match(localValidation.message, /بريدًا إلكترونيًا صحيحًا/);
  assert.doesNotMatch(localValidation.message, /الخادم/);
});

test('exception messages, callback URLs and arbitrary snapshot strings never reach presentation', () => {
  const privateText = 'https://example.invalid/callback?password=private&token=private';
  for (const cause of [new Error(privateText), new ApiError(privateText, 401),
    new ApiError(privateText, 0, 'NETWORK'), new ApiError(privateText, 500, 'AUTH_SERVER_ERROR')]) {
    assert.ok(!presentLoginError(cause).message.includes(privateText));
    assert.ok(!presentConnectionError(cause).includes(privateText));
  }
  assert.equal(presentSessionNotice(null), null);
  assert.equal(presentSessionNotice(''), null);
  assert.equal(presentSessionNotice('انتهت الجلسة. سجّل الدخول مجددًا.'), 'انتهت الجلسة. سجّل الدخول مجددًا.');
  assert.ok(!presentSessionNotice(privateText)?.includes(privateText));
});

test('connection messages distinguish transport failure from an online server error', () => {
  assert.match(presentConnectionError(new ApiError('', 0, 'NETWORK')), /اتصال الإنترنت/);
  assert.match(presentConnectionError(new ApiError('', 0, 'TIMEOUT')), /انتهت مهلة/);
  assert.match(presentConnectionError(new ApiError('', 500)), /الخادم أعاد خطأ/);
  assert.doesNotMatch(presentConnectionError(new ApiError('', 403)), /اتصال الإنترنت/);
});
