/** Test-only loopback fixture: membership map plus actual SFU refresh-token capture.
 * Never use this membership map in production. The real gateway calls Next's DB admission.
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { createVoiceGateway } from './voice-signaling-gateway.mjs';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { AccessToken, TokenVerifier, TrackSource } = require('livekit-server-sdk');
const { SignalResponse } = createRequire(require.resolve('livekit-server-sdk'))(
  '@livekit/protocol',
);
const internal = new URL(process.env.LIVEKIT_INTERNAL_URL);
internal.protocol = internal.protocol.replace(/^ws/, 'http');
if (!['localhost', '127.0.0.1', '[::1]'].includes(internal.hostname))
  throw new Error('Fixture requires loopback SFU');
const key = process.env.LIVEKIT_API_KEY,
  secret = process.env.LIVEKIT_API_SECRET;
const members = new Map(),
  refreshed = new Map(),
  sockets = new Set();
const verify = (token) => new TokenVerifier(key, secret).verify(token);
const identify = (claims) => `${claims.video?.room}:${claims.sub}`;
const deny = () => Object.assign(new Error('Fixture admission denied'), { status: 403 });
const observer = http.createServer((req, res) => {
  const proxy = http.request(new URL(req.url, internal), { headers: req.headers }, (upstream) => {
    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  proxy.end();
});
observer.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
observer.on('upgrade', async (req, socket, head) => {
  socket.on('error', () => {});
  try {
    const url = new URL(req.url, internal);
    const claims = await verify(
      url.searchParams.get('access_token') ||
        /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1],
    );
    const id = identify(claims);
    const proxy = http.request(url, { headers: { ...req.headers, host: internal.host } });
    proxy.on('upgrade', (response, upstream, upstreamHead) => {
      let buffer = Buffer.alloc(0);
      function observe(chunk) {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
          const opcode = buffer[0] & 15,
            masked = Boolean(buffer[1] & 128);
          let length = buffer[1] & 127,
            offset = 2;
          if (length === 126) {
            if (buffer.length < 4) return;
            length = buffer.readUInt16BE(2);
            offset = 4;
          } else if (length === 127) {
            if (buffer.length < 10) return;
            const large = buffer.readBigUInt64BE(2);
            if (large > 1_000_000n) {
              buffer = Buffer.alloc(0);
              return;
            }
            length = Number(large);
            offset = 10;
          }
          if (masked) offset += 4;
          if (buffer.length < offset + length) return;
          const payload = buffer.subarray(offset, offset + length);
          buffer = buffer.subarray(offset + length);
          if (opcode !== 2 || masked) continue;
          try {
            const event = SignalResponse.fromBinary(payload);
            if (event.message.case === 'refreshToken') refreshed.set(id, event.message.value);
          } catch {
            /* Ignore control/other signaling. */
          }
        }
      }
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          Object.entries(response.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n',
      );
      if (upstreamHead.length) {
        observe(upstreamHead);
        socket.write(upstreamHead);
      }
      if (head.length) upstream.write(head);
      upstream.on('data', observe);
      socket.pipe(upstream);
      upstream.pipe(socket);
      socket.on('close', () => upstream.destroy());
      upstream.on('close', () => socket.destroy());
      upstream.on('error', () => socket.destroy());
    });
    proxy.on('error', () => socket.destroy());
    proxy.end();
  } catch {
    socket.destroy();
  }
});
const control = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && req.url === '/state') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) {
        res.writeHead(413);
        res.end('{}');
        return;
      }
    }
    const state = JSON.parse(body);
    members.set(`${state.room}:${state.identity}`, state);
    res.end('{"ok":true}');
    return;
  }
  const url = new URL(req.url, 'http://fixture');
  if (req.method === 'GET' && url.pathname === '/refresh') {
    res.end(
      JSON.stringify({
        token:
          refreshed.get(`${url.searchParams.get('room')}:${url.searchParams.get('identity')}`) ||
          null,
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end('{}');
});
const gateway = createVoiceGateway({
  upstream: 'ws://127.0.0.1:7883',
  appOrigin: 'http://127.0.0.1:3000',
  port: 7891,
  admit: async (token) => {
    const claims = await verify(token),
      member = members.get(identify(claims));
    let version;
    try {
      version = JSON.parse(claims.metadata || '{}').voiceSessionVersion;
    } catch {
      throw deny();
    }
    if (!member?.member || member.version !== version) throw deny();
    const fresh = new AccessToken(key, secret, {
      identity: claims.sub,
      ttl: 60,
      metadata: JSON.stringify({ voiceSessionVersion: version }),
    });
    fresh.addGrant({
      roomJoin: true,
      room: claims.video.room,
      canSubscribe: true,
      canPublish: member.canPublish,
      canPublishSources: [TrackSource.MICROPHONE],
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    return fresh.toJwt();
  },
});
await new Promise((resolve) => observer.listen(7883, '127.0.0.1', resolve));
await new Promise((resolve) => control.listen(7892, '127.0.0.1', resolve));
await gateway.listen();
console.log('Local SFU fixture ready (test-only membership; no credentials logged).');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    for (const socket of sockets) socket.destroy();
    await gateway.close();
    observer.close();
    control.close();
    process.exit(0);
  });
