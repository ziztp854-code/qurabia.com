import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startResponseBarrier } from './cloud-response-proxy.mjs';

test('forwards once, observes success, and holds the reply beyond client abort', async () => {
  let calls = 0;
  const barrier = await startResponseBarrier({ room: 'fixture-room', identity: 'fixture-a', upstream: async (request) => {
    calls++;
    assert.equal(JSON.parse(request.body).identity, 'fixture-a');
    return { status: 200, body: '{}' };
  } });
  try {
    const controller = new AbortController();
    const request = fetch(barrier.url, { method: 'POST', headers: { authorization: 'fixture' }, body: JSON.stringify({ room: 'fixture-room', identity: 'fixture-a' }), signal: controller.signal });
    assert.equal(await barrier.observed, 200);
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
    assert.equal(calls, 1);
    barrier.release();
  } finally { await barrier.close(); }
});

test('rejects a request for the wrong identity without contacting upstream', async () => {
  let calls = 0;
  const barrier = await startResponseBarrier({ room: 'fixture-room', identity: 'fixture-a', upstream: async () => { calls++; return { status: 200, body: '{}' }; } });
  try {
    const observed = assert.rejects(barrier.observed, /forwarding failed/);
    const response = await fetch(barrier.url, { method: 'POST', headers: { authorization: 'fixture' }, body: JSON.stringify({ room: 'fixture-room', identity: 'wrong' }) });
    assert.equal(response.status, 502);
    await observed;
    assert.equal(calls, 0);
  } finally { await barrier.close(); }
});
