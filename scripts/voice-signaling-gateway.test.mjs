import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createVoiceGateway } from './voice-signaling-gateway.mjs';

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
