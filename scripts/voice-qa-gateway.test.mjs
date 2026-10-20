// Independent HTTP-only integration review of the default admission exchange.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createVoiceGateway } from './voice-signaling-gateway.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

test('default gateway admission fails closed on service failures and forwards only the exchanged bearer', async (t) => {
  const admitted = [];
  const forwarded = [];
  let responseMode = 403;
  const app = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    admitted.push({
      path: req.url,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
      body,
    });
    if (responseMode === 'redirect') {
      res.writeHead(302, { Location: upstreamOrigin + '/should-never-be-followed' });
      res.end();
      return;
    }
    res.writeHead(typeof responseMode === 'number' ? responseMode : 200, {
      'Content-Type': 'application/json',
    });
    if (responseMode === 'malformed') res.end('{');
    else if (responseMode === 'missing-token') res.end('{}');
    else res.end(JSON.stringify({ token: 'fresh-current-listener-grant' }));
  });
  const upstream = http.createServer((req, res) => {
    forwarded.push({
      url: req.url,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
    });
    res.end('signaling accepted');
  });
  const upstreamOrigin = await listen(upstream);
  const appOrigin = await listen(app);
  const gateway = createVoiceGateway({ upstream: upstreamOrigin, appOrigin, port: 0 });
  await gateway.listen();
  const origin = `http://127.0.0.1:${gateway.server.address().port}`;
  t.after(async () => {
    await gateway.close();
    await Promise.all([
      new Promise((resolve) => app.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  });

  assert.equal((await fetch(origin + '/rtc/validate')).status, 401);
  assert.equal(admitted.length, 0);
  const url =
    origin + '/rtc/validate?access_token=old-client-grant&access_token=duplicate-stale-grant';
  for (const [mode, expected] of [
    [401, 401],
    [403, 403],
    [429, 429],
    [500, 503],
    ['malformed', 503],
    ['missing-token', 503],
    ['redirect', 503],
  ]) {
    responseMode = mode;
    const denied = await fetch(url);
    assert.equal(denied.status, expected);
    assert.equal(await denied.text(), 'Voice signaling unavailable');
  }
  assert.equal(
    forwarded.length,
    0,
    'failed admission must never reach the SFU or follow an admission redirect',
  );
  responseMode = 200;
  assert.equal(
    (
      await fetch(url, {
        headers: {
          Cookie: 'app-session=must-not-be-forwarded',
          Authorization: 'Bearer stale-header-grant',
        },
      })
    ).status,
    200,
  );
  assert.equal(forwarded.length, 1);
  const receivedUrl = new URL(forwarded[0].url, upstreamOrigin);
  assert.deepEqual(receivedUrl.searchParams.getAll('access_token'), [
    'fresh-current-listener-grant',
  ]);
  assert.equal(forwarded[0].authorization, 'Bearer fresh-current-listener-grant');
  assert.equal(forwarded[0].cookie, undefined);
  assert.ok(
    admitted.every(
      (request) =>
        request.path === '/api/voice/admit/' &&
        request.authorization === 'Bearer old-client-grant' &&
        request.cookie === undefined &&
        request.body === '{}',
    ),
  );
});
