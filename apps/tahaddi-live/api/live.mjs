import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { initialState, reduce, problem } from '../server/cloud-state.mjs';
export const config = { maxDuration: 15 };
async function redis(...command) {
  const response = await fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(4500) });
  if (!response.ok) throw problem(503, 'خدمة الغرف غير متاحة مؤقتًا');
  const data = await response.json(); if (data.error) throw problem(503, 'خدمة الغرف غير متاحة مؤقتًا'); return data.result;
}
const sessionSecret = () => process.env.LIVE_SESSION_SECRET || process.env.AUTH_SECRET;
const prefix = () => `tahaddi-live:v1:${process.env.VERCEL_ENV || 'development'}:`;
async function transaction(action) {
  const key = prefix(), lease = randomUUID(); let acquired = false;
  for (let n = 0; n < 12; n++) {
    if (await redis('SET', key + 'lock', lease, 'NX', 'PX', 10000)) { acquired = true; break; }
    await new Promise(resolve => setTimeout(resolve, 80 + Math.random() * 100));
  }
  if (!acquired) throw problem(503, 'الخدمة مشغولة، حاول مجددًا');
  try {
    const saved = await redis('GET', key + 'state'); const state = saved ? JSON.parse(saved) : initialState();
    const result = action(state);
    const committed = await redis('EVAL', "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[2], ARGV[2], 'EX', 604800); redis.call('DEL', KEYS[1]); return 1 else return 0 end", 2, key + 'lock', key + 'state', lease, JSON.stringify(state));
    if (!committed) throw problem(503, 'تعذر حفظ الطلب، حاول مجددًا');
    return result;
  } catch (error) {
    await redis('EVAL', "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", 1, key + 'lock', lease).catch(() => {}); throw error;
  }
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  const json = (code, value) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
  try {
    const requestUrl = new URL(req.url, 'http://local');
    const path = requestUrl.searchParams.has('route') ? '/api/' + requestUrl.searchParams.get('route') : requestUrl.pathname;
    if (path === '/api/config') {
      const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
      if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) iceServers.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
      return json(200, { transport: 'poll', iceServers, turnConfigured: iceServers.length > 1 });
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !sessionSecret()) throw problem(503, 'إعداد خدمة الغرف غير مكتمل');
    if (!['GET', 'POST'].includes(req.method)) throw problem(405, 'الطريقة غير مدعومة');
    const host = req.headers.host;
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `https://${host}` && !(process.env.NODE_ENV !== 'production' && req.headers.origin === `http://${host}`)) throw problem(403, 'مصدر الطلب غير مسموح');
    let input = {};
    if (req.method === 'POST') {
      if (Number(req.headers['content-length']) > 65536) throw problem(413, 'الطلب كبير جدًا');
      if (req.body !== undefined) input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      else { let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 65536) throw problem(413, 'الطلب كبير جدًا'); } input = JSON.parse(raw || '{}'); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem(400, 'طلب غير صالح');
      if (Buffer.byteLength(JSON.stringify(input)) > 65536) throw problem(413, 'الطلب كبير جدًا');
    } else input = Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    const sign = id => createHmac('sha256', sessionSecret()).update('tahaddi-live:' + id).digest('hex');
    const token = String(req.headers.cookie || '').match(/(?:^|;\s*)tahaddi_live=([^;]+)/)?.[1];
    let userId;
    if (token) { const [id, signature] = token.split('.'); if (id && /^[a-f0-9]{64}$/.test(signature || '') && timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)))) userId = id; }
    if (!userId && path === '/api/session') {
      userId = randomUUID();
      res.setHeader('Set-Cookie', `tahaddi_live=${userId}.${sign(userId)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
    }
    if (!userId) throw problem(401, 'أنشئ جلسة أولًا');
    // Session creation has a separate IP quota so rotating cookies cannot bypass it.
    if (path === '/api/session') {
      const identity = createHmac('sha256', sessionSecret()).update(String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')).digest('hex');
      const n = await redis('INCR', prefix() + 'session-rate:' + identity + ':' + Math.floor(Date.now() / 60000));
      if (n === 1) await redis('EXPIRE', prefix() + 'session-rate:' + identity + ':' + Math.floor(Date.now() / 60000), 120);
      if (n > 60) throw problem(429, 'طلبات كثيرة، حاول لاحقًا');
    }
    if (path === '/api/clips') return json(req.method === 'GET' ? 200 : 501, req.method === 'GET' ? { clips: [] } : { error: 'رفع المقاطع غير مفعّل في نسخة الغرف الصوتية' });
    const result = await transaction(state => reduce(state, { path, method: req.method, userId, input }));
    json(200, result);
  } catch (error) { json(error.status || (error instanceof SyntaxError ? 400 : 503), { error: error.status ? error.message : 'تعذّر الاتصال بالخدمة، حاول مجددًا' }); }
}
