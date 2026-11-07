import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../api/live.mjs';

test('hosted HTTP flow signs sessions, joins two clients, delivers signaling and rejects spoofing', async t => {
  const values = new Map();
  const redisServer = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const [command, ...args] = JSON.parse(raw); let result;
    if (command === 'SET') { if (args.includes('NX') && values.has(args[0])) result = null; else { values.set(args[0], args[1]); result = 'OK'; } }
    else if (command === 'GET') result = values.get(args[0]) || null;
    else if (command === 'INCR') { result = Number(values.get(args[0]) || 0) + 1; values.set(args[0], result); }
    else if (command === 'EXPIRE') result = 1;
    else if (command === 'EVAL') {
      const [, n, lock, ...rest] = args;
      if (n === 2) { const [key, lease, state] = rest; result = values.get(lock) === lease ? 1 : 0; if (result) { values.set(key, state); values.delete(lock); } }
      else { result = values.get(lock) === rest[0] ? 1 : 0; if (result) values.delete(lock); }
    }
    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ result }));
  });
  await new Promise(resolve => redisServer.listen(0, '127.0.0.1', resolve));
  process.env.KV_REST_API_URL = `http://127.0.0.1:${redisServer.address().port}`;
  process.env.KV_REST_API_TOKEN = 'test-only'; process.env.LIVE_SESSION_SECRET = 'test-only-local-session-secret';
  const app = http.createServer(handler); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await Promise.all([new Promise(resolve => app.close(resolve)),new Promise(resolve => redisServer.close(resolve))]); });
  const origin = `http://127.0.0.1:${app.address().port}`;
  const request = async (path, cookie, input, extra = {}) => {
    const response = await fetch(origin + '/api/live?route=' + path, { ...(input ? { method: 'POST', body: JSON.stringify(input) } : {}), headers: { 'Content-Type':'application/json', ...(cookie ? { cookie } : {}), ...extra } });
    return { response, data: await response.json() };
  };
  const a = await request('session'), b = await request('session');
  const ca = a.response.headers.get('set-cookie').split(';')[0], cb = b.response.headers.get('set-cookie').split(';')[0];
  assert.match(a.response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  const ra = await request('rooms', ca, { title:'غرفة صوتية',mode:'voice' });
  assert.equal(ra.response.status, 200); const roomId = ra.data.room.id;
  const xa = (await request('connect', ca, {})).data.clientId, xb = (await request('connect', cb, {})).data.clientId;
  const send = (cookie, clientId, event) => request('events', cookie, { clientId, requestId: crypto.randomUUID(),event });
  await send(ca, xa, { type:'join',roomId }); await send(cb, xb, { type:'join',roomId });
  await send(ca, xa, { type:'chat',text:'صوتك وصل' });
  await send(ca, xa, { type:'signal',to:b.data.user.id,data:{ description:{type:'offer',sdp:'test-audio-sdp'} } });
  const received = await request('events&clientId='+xb+'&cursor=0', cb);
  assert.ok(received.data.events.some(e => e.event.type === 'chat'));
  assert.ok(received.data.events.some(e => e.event.type === 'signal' && e.event.from === a.data.user.id));
  assert.equal((await request('rooms', ca)).data.rooms[0].count, 2);
  assert.equal((await request('events&clientId='+xa, cb)).response.status, 409);
  assert.equal((await request('rooms',ca,{title:'spoof',mode:'voice'},{origin:'https://hostile.test'})).response.status,403);
  assert.equal((await request('rooms',ca.replace(/.$/,'X'))).response.status,401);
  await request('disconnect',cb,{clientId:xb});
  assert.equal((await request('rooms',ca)).data.rooms[0].count,1);
});
