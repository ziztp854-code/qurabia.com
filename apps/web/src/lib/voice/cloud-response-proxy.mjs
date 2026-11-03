import { createServer } from 'node:http';

// Test-only proxy. Its upstream is injected so the transport can be tested offline.
export async function startResponseBarrier({ room, identity, upstream }) {
  let release;
  let resolveObserved;
  let rejectObserved;
  const gate = new Promise((resolve) => { release = resolve; });
  const observed = new Promise((resolve, reject) => { resolveObserved = resolve; rejectObserved = reject; });
  let accepted = false;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/remove' || accepted) { res.writeHead(404).end(); return; }
    accepted = true;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (body.length > 16_384) throw new Error('Request too large');
      }
      const parsed = JSON.parse(body);
      if (parsed.room !== room || parsed.identity !== identity || typeof req.headers.authorization !== 'string')
        throw new Error('Unexpected fixture request');
      // Do not forward the client abort: the provider request must complete independently.
      const reply = await upstream({ body, authorization: req.headers.authorization });
      if (reply.status < 200 || reply.status >= 300) throw new Error('Provider did not confirm removal');
      resolveObserved(reply.status);
      await gate;
      if (!res.destroyed) res.writeHead(reply.status, { 'content-type': 'application/json' }).end(reply.body);
    } catch {
      rejectObserved(new Error('Removal forwarding failed'));
      if (!res.destroyed) res.writeHead(502).end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback proxy failed');
  return {
    url: `http://127.0.0.1:${address.port}/remove`, observed,
    release: () => release(),
    async close() { release(); server.closeAllConnections(); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}
