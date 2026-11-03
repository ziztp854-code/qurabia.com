import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createVoiceGateway } from './voice-signaling-gateway.mjs';

async function listenHttp(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function websocketHandshake(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    });
    request.on('response', (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('upgrade', (response, socket) => {
      socket.destroy();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
}

test('blank admission grants are rejected before any upstream request', async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((_req, res) => {
    upstreamRequests++;
    res.end('accepted');
  });
  let token = '';
  const app = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ token }));
  });
  const upstreamOrigin = await listenHttp(upstream);
  const appOrigin = await listenHttp(app);
  const gateway = createVoiceGateway({ upstream: upstreamOrigin, appOrigin, port: 0 });
  await gateway.listen();
  t.after(async () => {
    await gateway.close();
    await Promise.all([new Promise((r) => upstream.close(r)), new Promise((r) => app.close(r))]);
  });
  for (token of ['', '  ']) {
    const response = await fetch(
      `http://127.0.0.1:${gateway.server.address().port}/rtc/validate?access_token=client-token`,
    );
    assert.equal(response.status, 503);
  }
  assert.equal(upstreamRequests, 0);
});

test('old and refreshed bearer replays are denied by current membership before websocket forwarding', async (t) => {
  const grants = new Map([
    ['never-used-token', 'removed'],
    ['refreshed-token', 'removed'],
    ['allowed-token', 'allowed'],
  ]);
  const members = new Set(['removed', 'allowed']);
  const forwarded = [];
  const upstream = http.createServer();
  upstream.on('upgrade', (req, socket) => {
    forwarded.push(new URL(req.url, 'http://local').searchParams.get('access_token'));
    const accept = createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.end(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    );
  });
  const app = http.createServer((req, res) => {
    const token = (req.headers.authorization || '').slice('Bearer '.length);
    const identity = grants.get(token);
    if (!identity || !members.has(identity)) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ token: `current-${identity}` }));
  });
  const upstreamOrigin = await listenHttp(upstream);
  const appOrigin = await listenHttp(app);
  const gateway = createVoiceGateway({ upstream: upstreamOrigin, appOrigin, port: 0 });
  await gateway.listen();
  t.after(async () => {
    await gateway.close();
    await Promise.all([new Promise((r) => upstream.close(r)), new Promise((r) => app.close(r))]);
  });
  const port = gateway.server.address().port;
  members.delete('removed');
  assert.equal(await websocketHandshake(port, '/rtc?access_token=never-used-token'), 403);
  assert.equal(
    await websocketHandshake(port, '/rtc?access_token=refreshed-token&reconnect=1'),
    403,
  );
  assert.deepEqual(forwarded, []);
  assert.equal(await websocketHandshake(port, '/rtc?access_token=allowed-token'), 101);
  assert.deepEqual(forwarded, ['current-allowed']);
});

test('concurrent handshakes denied by membership checks do not reach the upstream', async (t) => {
  const members = new Set(['removed', 'allowed']);
  const requests = [];
  let release;
  let entered;
  const enteredFirst = new Promise((resolve) => {
    entered = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const app = http.createServer(async (req, res) => {
    const identity = (req.headers.authorization || '').slice('Bearer '.length);
    requests.push(identity);
    entered();
    await wait;
    if (!members.has(identity)) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ token: `fresh-${identity}` }));
  });
  const forwarded = [];
  const upstream = http.createServer((req, res) => {
    forwarded.push(new URL(req.url, 'http://local').searchParams.get('access_token'));
    res.end('ok');
  });
  const upstreamOrigin = await listenHttp(upstream);
  const appOrigin = await listenHttp(app);
  const gateway = createVoiceGateway({ upstream: upstreamOrigin, appOrigin, port: 0 });
  await gateway.listen();
  t.after(async () => {
    release();
    await gateway.close();
    await Promise.all([new Promise((r) => upstream.close(r)), new Promise((r) => app.close(r))]);
  });
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const removed = Array.from({ length: 12 }, () =>
    fetch(`${base}/rtc/validate?access_token=removed`),
  );
  await enteredFirst;
  members.delete('removed');
  release();
  assert.deepEqual(
    (await Promise.all(removed)).map((response) => response.status),
    Array(12).fill(403),
  );
  assert.deepEqual(forwarded, []);
  assert.equal((await fetch(`${base}/rtc/validate?access_token=allowed`)).status, 200);
  assert.deepEqual(forwarded, ['fresh-allowed']);
});

test('gateway blocks management paths and reports upstream outage without granting a connection', async (t) => {
  let admissions = 0;
  const upstream = http.createServer();
  const upstreamOrigin = await listenHttp(upstream);
  await new Promise((resolve) => upstream.close(resolve));
  const gateway = createVoiceGateway({
    upstream: upstreamOrigin,
    appOrigin: 'http://127.0.0.1:3000',
    port: 0,
    admit: async () => {
      admissions++;
      return 'valid-current-grant';
    },
  });
  await gateway.listen();
  t.after(() => gateway.close());
  const port = gateway.server.address().port;
  const base = `http://127.0.0.1:${port}`;
  for (const path of [
    '/twirp/livekit.RoomService/RemoveParticipant',
    '/rtc/%2e%2e/twirp/livekit.RoomService/RemoveParticipant',
  ]) {
    assert.equal((await fetch(`${base}${path}?access_token=test`)).status, 404);
    assert.equal(await websocketHandshake(port, `${path}?access_token=test`), 404);
  }
  assert.equal(admissions, 0);
  assert.equal((await fetch(`${base}/rtc/validate?access_token=test`)).status, 502);
  await assert.rejects(websocketHandshake(port, '/rtc?access_token=test'));
  assert.equal(admissions, 2);
});

test('an unreachable admission backend denies HTTP and websocket handshakes', async (t) => {
  let forwarded = 0;
  const upstream = http.createServer((_req, res) => {
    forwarded++;
    res.end('unexpected');
  });
  upstream.on('upgrade', (_req, socket) => {
    forwarded++;
    socket.destroy();
  });
  const app = http.createServer();
  const upstreamOrigin = await listenHttp(upstream);
  const appOrigin = await listenHttp(app);
  await new Promise((resolve) => app.close(resolve));
  const gateway = createVoiceGateway({ upstream: upstreamOrigin, appOrigin, port: 0 });
  await gateway.listen();
  t.after(async () => {
    await gateway.close();
    await new Promise((resolve) => upstream.close(resolve));
  });
  const port = gateway.server.address().port;
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}/rtc/validate?access_token=test`)).status,
    503,
  );
  assert.equal(await websocketHandshake(port, '/rtc?access_token=test'), 503);
  assert.equal(forwarded, 0);
});

test('signaling gateway denies before forwarding and replaces old permissions with current authorization', async (t) => {
  const seen = [];
  const upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    res.writeHead(200);
    res.end('ready');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const gateway = createVoiceGateway({
    upstream: `http://127.0.0.1:${upstream.address().port}`,
    appOrigin: 'http://127.0.0.1:3000',
    port: 0,
    admit: async (token) => {
      if (token !== 'old-valid-token') throw Object.assign(Error('denied'), { status: 403 });
      return 'current-listener-token';
    },
  });
  await gateway.listen();
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  t.after(async () => {
    await gateway.close();
    await new Promise((r) => upstream.close(r));
  });
  assert.equal((await fetch(base + '/rtc/validate')).status, 401);
  assert.equal((await fetch(base + '/rtc/validate?access_token=banned-token')).status, 403);
  assert.equal(
    (await fetch(base + '/twirp/livekit.RoomService/ListRooms?access_token=old-valid-token'))
      .status,
    404,
  );
  assert.equal(seen.length, 0);
  assert.equal(
    (
      await fetch(base + '/rtc/validate?access_token=old-valid-token', {
        headers: { cookie: 'private-session=never-forward' },
      })
    ).status,
    200,
  );
  assert.match(seen[0].url, /access_token=current-listener-token/);
  assert.equal(seen[0].headers.authorization, 'Bearer current-listener-token');
  assert.equal(seen[0].headers.cookie, undefined);
});

test('signaling gateway relays real WebSocket frames after admission', async (t) => {
  const sockets = new Set();
  let upstreamToken;
  const upstream = http.createServer();
  upstream.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  upstream.on('upgrade', (req, socket) => {
    upstreamToken = new URL(req.url, 'http://local').searchParams.get('access_token');
    const accept = createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    );
    socket.on('data', (data) => {
      if ((data[0] & 15) === 8) {
        socket.end();
        return;
      }
      const len = data[1] & 127;
      if (len > 125) return;
      const mask = data.subarray(2, 6);
      const payload = Buffer.from(data.subarray(6, 6 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      const reply = Buffer.from('echo:' + payload);
      socket.write(Buffer.concat([Buffer.from([0x81, reply.length]), reply]));
    });
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const gateway = createVoiceGateway({
    upstream: `http://127.0.0.1:${upstream.address().port}`,
    appOrigin: 'http://127.0.0.1:3000',
    port: 0,
    admit: async () => 'fresh-grant',
  });
  await gateway.listen();
  t.after(async () => {
    await gateway.close();
    for (const s of sockets) s.destroy();
    await new Promise((r) => upstream.close(r));
  });
  const ws = new WebSocket(
    `ws://127.0.0.1:${gateway.server.address().port}/rtc?access_token=old-grant`,
  );
  await once(ws, 'open');
  const message = once(ws, 'message');
  ws.send('hello');
  assert.equal((await message)[0].data, 'echo:hello');
  assert.equal(upstreamToken, 'fresh-grant');
  ws.close();
});
