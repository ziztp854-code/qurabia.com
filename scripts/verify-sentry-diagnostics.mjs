// Run after pnpm build: pnpm exec tsx scripts/verify-sentry-diagnostics.mjs
// Uses synthetic data, real SDK clients, and an in-memory transport only.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as serverSdk from '@sentry/node';
import { createSentryOptions } from '../apps/web/src/lib/observability/sentry-options.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const sentryRequire = createRequire(webRequire.resolve('@sentry/nextjs/package.json'));
const toolingRequire = createRequire(import.meta.resolve('tsx/package.json'));
const { build } = toolingRequire('esbuild');
const { chromium } = webRequire('@playwright/test');
const nextSdk = webRequire('@sentry/nextjs');
const nextBrowserSdk = webRequire(
  path.join(
    path.dirname(webRequire.resolve('@sentry/nextjs/package.json')),
    'build/cjs/index.client.js',
  ),
);
assert.equal(nextBrowserSdk.BrowserClient, sentryRequire('@sentry/react').BrowserClient);
const buildConfig = JSON.parse(
  readFileSync(path.join(root, 'apps/web/.next/required-server-files.json'), 'utf8'),
);
const release = buildConfig.config.env.NEXT_PUBLIC_SENTRY_RELEASE;
assert.ok(release, 'Production build must contain a release identifier');
for (const directory of ['apps/web/.next/static/chunks', 'apps/web/.next/server']) {
  const compiledDirectory = path.join(root, directory);
  assert.ok(
    readdirSync(compiledDirectory, { recursive: true }).some(
      (file) =>
        file.endsWith('.js') &&
        readFileSync(path.join(compiledDirectory, file), 'utf8').includes(release),
    ),
    `Compiled ${directory} does not contain the production release`,
  );
}

// This function also runs inside Chromium, using the browser SDK's own parser.
async function probe(sdk, options, runtime, captureAgain) {
  const envelopes = [];
  const originalExceptions = [];
  const scope = new sdk.Scope();
  const client = new sdk.Client({
    ...options,
    stackParser: sdk.defaultStackParser,
    integrations: [],
    sendClientReports: false,
    tracesSampleRate: 0,
    transport: () => ({
      send: async (envelope) => {
        // The SDK has finished processing the event when it reaches transport.
        envelopes.push(JSON.parse(JSON.stringify(envelope)));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
    beforeSend: (event, hint) => {
      originalExceptions.push(hint.originalException);
      return options.beforeSend(event);
    },
  });
  client.init();
  scope.setClient(client);
  scope.setUser({ id: 'synthetic-player', email: 'synthetic@example.invalid' });
  scope.setExtra('password', 'SYNTHETIC_PASSWORD');
  scope.addBreadcrumb({ message: 'SYNTHETIC_ACCESS_TOKEN' });
  scope.addEventProcessor((event) => ({
    ...event,
    transaction: '/join/SYNTHETIC_ROOM?token=SYNTHETIC_ACCESS_TOKEN',
    request: {
      url: 'https://synthetic@example.invalid/join/SYNTHETIC_ROOM?password=SYNTHETIC_PASSWORD',
      headers: { authorization: 'Bearer SYNTHETIC_ACCESS_TOKEN' },
      cookies: { session: 'SYNTHETIC_ACCESS_TOKEN' },
      data: { password: 'SYNTHETIC_PASSWORD' },
    },
    sdkProcessingMetadata: {
      dynamicSamplingContext: { transaction: 'SYNTHETIC_ROOM', user_segment: 'synthetic-player' },
    },
  }));

  const compiledFile =
    runtime === 'browser'
      ? 'https://example.invalid/_next/static/chunks/abc123.js'
      : '/srv/synthetic-player/.next/server/chunks/ssr/[root-of-the-server]__abc123.js';
  const error = new TypeError('SYNTHETIC_PASSWORD synthetic@example.invalid');
  error.stack = `TypeError: SYNTHETIC_PASSWORD\n    at syntheticPlayer (${compiledFile}?token=SYNTHETIC_ACCESS_TOKEN:42:7)\n    at privateFrame (/home/synthetic-player/private.js:2:1)`;
  scope.captureException(error);
  scope.captureException(error); // React effect replay / a second SDK capture of the same object.
  await captureAgain?.(error, client);

  const other = new TypeError('SYNTHETIC_ACCESS_TOKEN');
  other.stack = `TypeError: SYNTHETIC_ACCESS_TOKEN\n    at another (${compiledFile}:99:3)`;
  scope.captureException(other);
  const noStack = new Error('SYNTHETIC_PASSWORD');
  noStack.stack = undefined;
  scope.captureException(noStack);
  if (!(await client.flush(5000))) throw new Error('Transport did not flush');
  await client.close(5000);
  const events = envelopes.flatMap((envelope) =>
    envelope[1].filter(([header]) => header.type === 'event').map(([, event]) => event),
  );
  if (originalExceptions[0] !== error) throw new Error('Original exception was not forwarded');
  return { envelopes, events };
}

const options = createSentryOptions({
  NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
  NEXT_PUBLIC_SENTRY_RELEASE: release,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'diagnostics-test',
});

const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error('External fetch is forbidden in this probe');
};
let serverResult;
try {
  serverResult = await probe(
    { ...serverSdk, Client: serverSdk.NodeClient },
    options,
    'server',
    (error, client) => {
      const currentScope = serverSdk.getCurrentScope();
      const previousClient = currentScope.getClient();
      currentScope.setClient(client);
      try {
        // Real Next.js onRequestError path must not send an already captured object twice.
        nextSdk.captureRequestError(
          error,
          {
            path: '/join/SYNTHETIC_ROOM?token=SYNTHETIC_ACCESS_TOKEN',
            method: 'GET',
            headers: { authorization: 'Bearer SYNTHETIC_ACCESS_TOKEN' },
          },
          { routerKind: 'App Router', routePath: '/join/[code]', routeType: 'render' },
        );
      } finally {
        currentScope.setClient(previousClient);
      }
    },
  );
} finally {
  globalThis.fetch = originalFetch;
}

const bundle = await build({
  stdin: {
    contents: `
      // Next.js re-exports this BrowserClient. Import the underlying browser SDK
      // so the standalone probe does not pull Next's server-only build helpers.
      import { BrowserClient, Scope, defaultStackParser } from ${JSON.stringify(sentryRequire.resolve('@sentry/react'))};
      import { createSentryOptions } from './src/lib/observability/sentry-options.ts';
      window.runDiagnosticProbe = () => (${probe.toString()})(
        {Client: BrowserClient, Scope, defaultStackParser},
        createSentryOptions({NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
          NEXT_PUBLIC_SENTRY_RELEASE: ${JSON.stringify(release)},
          NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'diagnostics-test'}), 'browser');
    `,
    resolveDir: path.join(root, 'apps/web'),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_EXECUTABLE_PATH ??
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true,
});
let browserResult;
const requests = [];
try {
  const page = await browser.newPage();
  await page.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.setContent('<!doctype html><title>Synthetic Sentry diagnostic test</title>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  browserResult = await page.evaluate(() => window.runDiagnosticProbe());
} finally {
  await browser.close();
}
assert.deepEqual(requests, [], 'Browser attempted an unexpected network request');
for (const [runtime, result] of [
  ['browser', browserResult],
  ['server', serverResult],
]) {
  assert.equal(result.events.length, 3, `${runtime}: duplicate or missing events`);
  const serialized = JSON.stringify(result.envelopes);
  assert.doesNotMatch(
    serialized,
    /SYNTHETIC_|synthetic-player|synthetic@example|authorization|password|cookies|query_string/i,
  );
  for (const event of result.events) {
    assert.equal(event.release, release);
    assert.equal(event.user, undefined);
    assert.equal(event.request, undefined);
    assert.equal(event.transaction, undefined);
    assert.equal(event.breadcrumbs, undefined);
  }
  const first = result.events[0].exception.values[0];
  assert.equal(first.value, 'WEB_TYPE_ERROR');
  assert.equal(first.stacktrace.frames.length, 1);
  assert.equal(first.stacktrace.frames[0].lineno, 42);
  assert.equal(first.stacktrace.frames[0].colno, 7);
  assert.equal(result.events[1].exception.values[0].stacktrace.frames[0].lineno, 99);
  assert.equal(result.events[2].exception.values[0].value, 'WEB_ERROR');
}
console.log(
  'PASS: Chromium and Node SDK final envelopes, original exceptions, duplicate suppression, stack locations, matching production-build release, and sensitive-data removal. No external events sent.',
);
console.log(
  JSON.stringify(
    { releaseSource: 'production required-server-files.json', example: browserResult.events[0] },
    null,
    2,
  ),
);
