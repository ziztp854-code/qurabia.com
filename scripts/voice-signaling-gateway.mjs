/** Local/self-hosted WebSocket admission proxy. Never expose upstream signaling directly. */
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

export function createVoiceGateway({
  upstream,
  appOrigin,
  host = '127.0.0.1',
  port = 7890,
  admit: customAdmit,
} = {}) {
  const target = new URL(upstream);
  target.protocol = target.protocol.replace(/^ws/, 'http');
  const app = new URL(appOrigin);
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    !['http:', 'https:'].includes(app.protocol) ||
    target.username ||
    target.password ||
    app.username ||
    app.password
  )
    throw new Error('Invalid voice gateway origins');
  const local = (url) => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    (!local(target) && target.protocol !== 'https:') ||
    (!local(app) && app.protocol !== 'https:')
  )
    throw new Error('Non-local gateway connections require HTTPS');
  const transport = target.protocol === 'https:' ? https : http;
  const sockets = new Set();
  const rates = new Map();
  const defaultAdmit = async (token) => {
    const response = await fetch(new URL('/api/voice/admit/', app), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!response.ok)
      throw Object.assign(new Error('Voice admission denied'), {
        status: [401, 403, 429].includes(response.status) ? response.status : 503,
      });
    const data = await response.json();
    if (typeof data.token !== 'string' || data.token.length > 16_384)
      throw new Error('Invalid admission response');
    return data.token;
  };
  const admit = customAdmit || defaultAdmit;
  async function destination(req) {
    const url = new URL(req.url, 'http://gateway');
    if (url.pathname !== '/rtc' && !url.pathname.startsWith('/rtc/'))
      throw Object.assign(new Error('Not found'), { status: 404 });
    if (req.method !== 'GET') throw Object.assign(new Error('Method not allowed'), { status: 405 });
    const id = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    if (rates.size > 5000)
      for (const [key, value] of rates) if (now - value.at > 60_000) rates.delete(key);
    const rate = rates.get(id);
    if (!rate || now - rate.at > 60_000) rates.set(id, { at: now, count: 1 });
    else if (++rate.count > 120)
      throw Object.assign(new Error('Too many requests'), { status: 429 });
    const token =
      url.searchParams.get('access_token') ||
      /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token || token.length > 16_384)
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    // Reconnects and SDK-refreshed tokens pass the same current DB authorization.
    const current = await admit(token);
    url.searchParams.set('access_token', current);
    const destination = new URL(url.pathname + url.search, target);
    const headers = { ...req.headers, host: target.host, authorization: `Bearer ${current}` };
    delete headers.cookie;
    delete headers['x-forwarded-for'];
    delete headers['x-forwarded-host'];
    return { destination, headers };
  }
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{"service":"voice-signaling-gateway","ok":true}');
      return;
    }
    try {
      const { destination: url, headers } = await destination(req);
      const proxy = transport.request(
        url,
        { method: 'GET', headers, timeout: 10_000 },
        (upstreamResponse) => {
          const allowed = {
            'content-type': upstreamResponse.headers['content-type'] || 'application/octet-stream',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          };
          res.writeHead(upstreamResponse.statusCode || 502, allowed);
          upstreamResponse.pipe(res);
        },
      );
      proxy.on('timeout', () => proxy.destroy());
      proxy.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      proxy.end();
    } catch (error) {
      res.writeHead(error.status || 503, { 'Cache-Control': 'no-store' });
      res.end('Voice signaling unavailable');
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    try {
      const { destination: url, headers } = await destination(req);
      if (socket.destroyed) return;
      const proxy = transport.request(url, { method: 'GET', headers, timeout: 10_000 });
      proxy.on('upgrade', (response, upstreamSocket, upstreamHead) => {
        proxy.setTimeout(0);
        socket.setTimeout(0);
        upstreamSocket.setTimeout(0);
        const fields = [];
        for (let i = 0; i < response.rawHeaders.length; i += 2)
          if (
            [
              'upgrade',
              'connection',
              'sec-websocket-accept',
              'sec-websocket-protocol',
              'sec-websocket-extensions',
            ].includes(response.rawHeaders[i].toLowerCase())
          )
            fields.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`);
        socket.write('HTTP/1.1 101 Switching Protocols\r\n' + fields.join('\r\n') + '\r\n\r\n');
        if (upstreamHead.length) socket.write(upstreamHead);
        if (head.length) upstreamSocket.write(head);
        socket.pipe(upstreamSocket);
        upstreamSocket.pipe(socket);
        socket.on('close', () => upstreamSocket.destroy());
        upstreamSocket.on('close', () => socket.destroy());
        upstreamSocket.on('error', () => socket.destroy());
        socket.on('error', () => upstreamSocket.destroy());
      });
      proxy.on('response', (response) => {
        socket.end(
          `HTTP/1.1 ${response.statusCode || 502} Error\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
        );
        response.resume();
      });
      proxy.on('timeout', () => proxy.destroy());
      proxy.on('error', () => socket.destroy());
      proxy.end();
    } catch (error) {
      if (!socket.destroyed)
        socket.end(
          `HTTP/1.1 ${error.status || 503} Error\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
        );
    }
  });
  return {
    server,
    listen: () => new Promise((resolve) => server.listen(port, host, resolve)),
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.LIVEKIT_INTERNAL_URL || !process.env.VOICE_APP_ORIGIN)
    throw new Error('Set LIVEKIT_INTERNAL_URL and VOICE_APP_ORIGIN');
  const gateway = createVoiceGateway({
    upstream: process.env.LIVEKIT_INTERNAL_URL,
    appOrigin: process.env.VOICE_APP_ORIGIN,
    host: process.env.VOICE_GATEWAY_HOST || '127.0.0.1',
    port: Number(process.env.VOICE_GATEWAY_PORT || 7890),
  });
  await gateway.listen();
  console.log('Voice signaling gateway ready on configured local port.');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => {
      await gateway.close();
      process.exit(0);
    });
}
