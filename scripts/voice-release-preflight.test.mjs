import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runVoicePreflight } from './voice-release-preflight.mjs';

async function withServer(handler, action) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await action(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
const options = { intervalMs: 20, timeoutMs: 500, allowLoopback: true };
function send(response, payload, status = 200, cache = 'no-store') {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': cache });
  response.end(JSON.stringify(payload));
}
function state(poll, age = 0) {
  return { ready: true, state: 'ready', lastSuccessAtMs: Date.now() - age, processInstanceId: 'test-instance', successSequence: poll };
}

test('accepts two fresh ready responses with a completed new worker poll', async () => {
  let calls = 0;
  await withServer((request, response) => {
    assert.equal(request.url, '/realtime/health/voice-reconciliation');
    calls += 1; send(response, state(calls + 1));
  }, async (origin) => assert.equal((await runVoicePreflight({ origin, ...options })).ok, true));
  assert.equal(calls, 2);
});

test('fails closed on non-ready, missing, stale, cached, or unchanging evidence', async () => {
  const scenarios = [
    () => ({ body: { ready: false, state: 'backlog_pending' }, status: 503 }),
    () => ({ body: { ready: true, state: 'ready' } }),
    () => ({ body: state(2, 100_000) }),
    () => ({ body: state(2), cache: 'public' }),
    () => ({ body: state(2) }),
    (n) => ({ body: { ...state(n + 1), processInstanceId: `instance-${n}` } }),
    () => ({ body: state(2), status: 302 }),
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    await withServer((request, response) => {
      const { body, status = 200, cache = 'no-store' } = scenario(++calls);
      send(response, body, status, cache);
    }, async (origin) => assert.equal((await runVoicePreflight({ origin, ...options })).ok, false));
  }
});

test('rejects invalid origins and unreachable service without exposing the supplied URL', async () => {
  for (const origin of ['https://user:secret@example.com/', 'https://example.com/path', '', 'http://example.com']) {
    const result = await runVoicePreflight({ origin, ...options });
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /secret|example\.com/);
  }
  const result = await runVoicePreflight({ origin: 'http://127.0.0.1:1', ...options });
  assert.equal(result.ok, false);
});
