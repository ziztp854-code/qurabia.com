/** Real HTTPS NextAuth integration; private account and cookies never enter reports. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CookieVault, type SecureStorage } from '../src/auth/cookie-vault';
import { ApiError, createApiClient, type NativeTransport } from '../src/auth/http-client';
import { createSessionManager } from '../src/auth/session-manager';

const origin = 'https://localhost:3443';
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0 || !args[i + 1]) throw new Error('Missing private integration option');
    return path.resolve(args[i + 1]);
  };
  const credentials = arg('--credentials'), baselineDir = arg('--baseline'), reports = arg('--reports');
  const result: Record<string, any> = {
    status: 'failed', source_sha: process.env.GITHUB_SHA, phase: 'load_fixture',
    scope: 'real local HTTPS NextAuth provider + isolated account; Node transport, not Android',
    checks: {}, controlled_failures: {},
  };
  const transport: NativeTransport = async (url, init) => {
    const response = await fetch(url, init);
    return { status: response.status, url: response.url, headers: response.headers,
      rawSetCookies: response.headers.getSetCookie(), text: () => response.text() };
  };
  function storage(): SecureStorage {
    const values = new Map<string, string>();
    return { getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      deleteItem: async key => { values.delete(key); } };
  }
  const publicError = (value: unknown) => {
    const error = value as { code?: unknown; status?: unknown; stage?: unknown };
    const codes = new Set(['REQUEST_FAILED', 'INVALID_CREDENTIALS', 'AUTH_CSRF_REJECTED',
      'SESSION_NOT_ESTABLISHED', 'CSRF_UNAVAILABLE', 'INVALID_RESPONSE', 'AUTH_SERVER_ERROR', 'NETWORK', 'TIMEOUT']);
    const stages = new Set(['api', 'auth-csrf', 'auth-callback', 'auth-session']);
    return {
      code: typeof error?.code === 'string' && codes.has(error.code) ? error.code : 'UNCLASSIFIED',
      status: typeof error?.status === 'number' && error.status >= 0 && error.status <= 599 ? error.status : 0,
      stage: typeof error?.stage === 'string' && stages.has(error.stage) ? error.stage : 'not_recorded',
    };
  };
  function ensure(value: unknown) { if (!value) throw new Error('Integration assertion failed'); }
  try {
    const metadata = await fs.stat(credentials);
    ensure(metadata.isFile() && (metadata.mode & 0o077) === 0);
    const account = JSON.parse(await fs.readFile(credentials, 'utf8'));
    ensure(account.origin === origin && /^mobile_login_[a-f0-9-]{36}\+ci@example\.test$/.test(account.email));
    ensure(typeof account.password === 'string' && account.password.includes('+%25=&'));
    const oldHttp = await import(pathToFileURL(path.join(baselineDir, 'http-client.ts')).href);
    const oldVault = await import(pathToFileURL(path.join(baselineDir, 'cookie-vault.ts')).href);
    const oldSession = await import(pathToFileURL(path.join(baselineDir, 'session-manager.ts')).href);
    result.phase = 'baseline_rejection';
    const oldJar = new oldVault.CookieVault(storage(), origin);
    const oldClient = oldHttp.createApiClient({ origin, cookies: oldJar, transport });
    const oldManager = oldSession.createSessionManager(oldClient, oldJar);
    let baselineFailure: unknown;
    try { await oldManager.signIn(account.email, account.password + '-incorrect'); }
    catch (error) { baselineFailure = error; }
    const baselineError = publicError(baselineFailure);
    ensure(baselineError.code === 'REQUEST_FAILED' && baselineError.status === 401);
    result.controlled_failures.baseline_invalid_credentials = baselineError;
    result.checks.baseline_generic_401_reproduced = true;

    result.phase = 'baseline_valid_login';
    try {
      await oldManager.signIn(account.email, account.password);
      ensure(oldManager.getSnapshot().user?.email === account.email);
      result.checks.baseline_valid_login = true;
      await oldManager.signOut();
    } catch (error) {
      result.checks.baseline_valid_login = false;
      result.baseline_valid_login_failure = publicError(error);
    }

    const make = (adapter = transport, vaultStorage = storage()) => {
      const jar = new CookieVault(vaultStorage, origin);
      const client = createApiClient({ origin, transport: adapter, cookies: jar });
      return { jar, manager: createSessionManager(client, jar), vaultStorage };
    };
    result.phase = 'candidate_rejection';
    const candidate = make();
    let rejected: unknown;
    try { await candidate.manager.signIn(account.email, account.password + '-incorrect'); }
    catch (error) { rejected = error; }
    ensure(rejected instanceof ApiError && rejected.code === 'INVALID_CREDENTIALS' && rejected.status === 401);
    ensure(candidate.manager.getSnapshot().status === 'unauthenticated' && !candidate.jar.hasSession());
    result.controlled_failures.invalid_credentials = publicError(rejected);
    result.checks.real_rejection_classified = true;

    result.phase = 'real_csrf_rejection';
    const badCsrf = make(async (url, init) => {
      if (url.endsWith('/api/auth/callback/credentials/')) {
        const body = new URLSearchParams(init.body as string);
        body.set('csrfToken', '0'.repeat(64));
        return transport(url, { ...init, body: body.toString() });
      }
      return transport(url, init);
    });
    let csrfFailure: unknown;
    try { await badCsrf.manager.signIn(account.email, account.password); }
    catch (error) { csrfFailure = error; }
    ensure(csrfFailure instanceof ApiError && csrfFailure.code === 'AUTH_CSRF_REJECTED');
    result.controlled_failures.csrf_token_intentionally_corrupted = publicError(csrfFailure);
    result.checks.real_csrf_rejection_classified = true;

    result.phase = 'session_cookie_loss';
    const missingCookie = make(async (url, init) => {
      const response = await transport(url, init);
      if (url.endsWith('/api/auth/callback/credentials/'))
        return { ...response, rawSetCookies: [] };
      return response;
    });
    let sessionFailure: unknown;
    try { await missingCookie.manager.signIn(account.email, account.password); }
    catch (error) { sessionFailure = error; }
    ensure(sessionFailure instanceof ApiError && sessionFailure.code === 'SESSION_NOT_ESTABLISHED');
    result.controlled_failures.session_cookie_intentionally_dropped = publicError(sessionFailure);
    result.checks.missing_session_distinguished = true;

    result.phase = 'candidate_valid_login';
    await candidate.manager.signIn(account.email, account.password);
    ensure(candidate.manager.getSnapshot().user?.email === account.email && candidate.jar.hasSession());
    result.checks.real_valid_login = true;
    result.phase = 'session_restore';
    const restored = make(transport, candidate.vaultStorage);
    await restored.manager.initialize();
    ensure(restored.manager.getSnapshot().user?.email === account.email && restored.jar.hasSession());
    result.checks.client_cookie_vault_restore = true;
    result.phase = 'logout';
    await restored.manager.signOut();
    const loggedOut = make(transport, candidate.vaultStorage);
    await loggedOut.manager.initialize();
    ensure(loggedOut.manager.getSnapshot().status === 'unauthenticated' && !loggedOut.jar.hasSession());
    result.checks.real_logout_clears_restored_session = true;
    result.phase = 'complete'; result.status = 'passed';
  } catch {
    result.error = 'Real isolated protocol check failed at the recorded phase';
  }
  await fs.mkdir(reports, { recursive: true });
  await fs.writeFile(path.join(reports, 'login-protocol.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('LOGIN_PROTOCOL ' + JSON.stringify(result));
  if (result.status !== 'passed') process.exitCode = 1;
}
main().catch(() => { console.error('Private integration setup failed'); process.exitCode = 1; });
