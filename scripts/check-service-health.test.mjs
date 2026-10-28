import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { probeServices } from './check-service-health.mjs';

let server, base;
before(async () => {
  server = createServer((request, response) => {
    if (request.url === '/web') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<html></html>'); }
    else if (request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ service: 'tahaddi-realtime', status: 'ok' })); }
    else if (request.url === '/slow') { setTimeout(() => { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<html></html>'); }, 40); }
    else if (request.url === '/redirect') { response.writeHead(302, { location: '/web' }); response.end(); }
    else { response.writeHead(200, { 'content-type': 'text/html' }); response.end('not a health endpoint'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });

describe('service liveness probe', () => {
  it('accepts the expected web page and realtime health response', async () => {
    const results = await probeServices({ webUrl: `${base}/web`, realtimeUrl: `${base}/health` });
    assert.deepEqual(results.map((item) => item.ok), [true, true]);
  });
  it('reports a response that exceeds the configured latency', async () => {
    const results = await probeServices({ webUrl: `${base}/slow`, realtimeUrl: `${base}/health`, maxMs: 10 });
    assert.equal(results[0].ok, false);
    assert.match(results[0].detail, /أبطأ من الحد المحدد/);
  });
  it('rejects redirects and a successful HTML response in place of realtime health', async () => {
    const results = await probeServices({ webUrl: `${base}/redirect`, realtimeUrl: `${base}/wrong` });
    assert.deepEqual(results.map((item) => item.ok), [false, false]);
  });
});
