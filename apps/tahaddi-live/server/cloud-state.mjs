import { randomUUID } from 'node:crypto';
export const problem = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, max = 80) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function initialState() { return { users: {}, rooms: {}, clients: {}, rates: {} }; }
export function reduce(s, { path, method, userId, input = {}, now = Date.now() }) {
  const fail = (status, message) => { throw problem(status, message); };
  const people = room => Object.values(s.clients).filter(c => c.roomId === room.id).map(c => ({ id: c.userId, name: s.users[c.userId].name, media: c.media }));
  const view = room => ({ ...room, messages: undefined, pk: undefined, participants: people(room), count: people(room).length, capacity: 4 });
  const emit = (c, event) => { c.seq++; c.events.push({ seq: c.seq, event }); c.events = c.events.slice(-200); };
  const broadcast = (roomId, event, except) => Object.values(s.clients).filter(c => c.roomId === roomId && c.id !== except).forEach(c => emit(c, event));
  const update = room => broadcast(room.id, { type: 'room-update', room: view(room), users: people(room) });
  const leave = c => {
    const room = s.rooms[c.roomId]; c.roomId = null; c.media = { audio: false, video: false };
    if (!room) return;
    if (room.pk?.sides.some(p => p.id === c.userId)) { room.pk = null; broadcast(room.id, { type: 'pk', pk: null }); }
    broadcast(room.id, { type: 'peer-left', userId: c.userId }); update(room);
  };
  for (const c of Object.values(s.clients)) if (now - c.seen > 45000) { leave(c); delete s.clients[c.id]; }
  for (const [id, u] of Object.entries(s.users)) if (now - u.seen > 7 * 86400000) delete s.users[id];
  for (const [id, r] of Object.entries(s.rooms)) if (!people(r).length && now - r.createdAt > 86400000) delete s.rooms[id];
  for (const [id, rate] of Object.entries(s.rates)) if (now - rate.at > 60000) delete s.rates[id];
  let user = s.users[userId];
  if (path === '/api/session' && ['GET', 'POST'].includes(method)) {
    if (!user) {
      if (Object.keys(s.users).length >= 10000) fail(429, 'الخدمة مشغولة، حاول لاحقًا');
      user = s.users[userId] = { id: userId, name: 'ضيف ' + Math.floor(Math.random() * 900 + 100), balance: 500, seen: now };
    }
    if (method === 'POST' && clean(input.name, 30)) { user.name = clean(input.name, 30); for (const room of Object.values(s.rooms)) if (people(room).some(p => p.id === userId)) update(room); }
    user.seen = now;
    return { user: { id: user.id, name: user.name, balance: user.balance } };
  }
  if (!user) fail(401, 'انتهت الجلسة، أعد تحميل الصفحة');
  user.seen = now;
  const rate = s.rates[userId] ||= { at: now, count: 0 };
  if (++rate.count > 240) fail(429, 'طلبات كثيرة، انتظر قليلًا');
  if (path === '/api/rooms' && method === 'GET') return { rooms: Object.values(s.rooms).map(view) };
  if (path === '/api/rooms' && method === 'POST') {
    if (!clean(input.title) || !['voice', 'video'].includes(input.mode)) fail(400, 'أدخل اسم الغرفة ونوعها');
    if (Object.keys(s.rooms).length >= 100 || Object.values(s.rooms).filter(r => r.host.id === userId).length >= 5) fail(429, 'وصلت للحد المسموح للغرف');
    const room = { id: randomUUID(), title: clean(input.title), mode: input.mode, category: clean(input.category, 30) || 'دردشة', theme: 'amber', host: { id: userId, name: user.name }, description: 'غرفة تحدي لايف', messages: [], pk: null, createdAt: now };
    s.rooms[room.id] = room; return { room: view(room) };
  }
  if (path === '/api/connect' && method === 'POST') {
    if (Object.values(s.clients).filter(c => c.userId === userId).length >= 4 || Object.keys(s.clients).length >= 100) fail(429, 'عدد الاتصالات مكتمل');
    const id = randomUUID(); s.clients[id] = { id, userId, roomId: null, media: { audio: false, video: false }, events: [], seq: 0, seen: now, requests: [] }; return { clientId: id };
  }
  const c = s.clients[input.clientId];
  if (!c || c.userId !== userId) fail(409, 'انتهى الاتصال، جارٍ إعادة الاتصال');
  c.seen = now;
  if (path === '/api/disconnect' && method === 'POST') { leave(c); delete s.clients[c.id]; return { ok: true }; }
  if (path === '/api/events' && method === 'GET') {
    const cursor = Math.max(0, Number(input.cursor) || 0);
    if (c.events.length && cursor < c.events[0].seq - 1) fail(409, 'يلزم تحديث الاتصال');
    c.events = c.events.filter(e => e.seq > cursor);
    return { events: c.events };
  }
  if (path !== '/api/events' || method !== 'POST') fail(404, 'الطلب غير موجود');
  if (typeof input.requestId !== 'string' || input.requestId.length > 80) fail(400, 'معرف الطلب غير صالح');
  if (c.requests.includes(input.requestId)) return { ok: true };
  const event = input.event;
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail(400, 'حدث غير صالح');
  c.requests = [...c.requests.slice(-99), input.requestId];
  try {
    if (event.type === 'join') {
      const room = s.rooms[event.roomId]; if (!room) fail(404, 'الغرفة غير موجودة');
      if (c.roomId === room.id) return { ok: true };
      if (people(room).length >= 4) fail(409, 'الغرفة مكتملة');
      if (people(room).some(p => p.id === userId)) fail(409, 'أنت متصل بالغرفة بالفعل');
      leave(c); c.roomId = room.id;
      emit(c, { type: 'joined', room: view(room), users: people(room), selfId: userId, messages: room.messages, pk: room.pk });
      broadcast(room.id, { type: 'peer-joined', user: { id: userId, name: user.name, media: c.media } }, c.id); update(room);
    } else if (event.type === 'leave') { leave(c); emit(c, { type: 'left' }); }
    else {
      const room = s.rooms[c.roomId]; if (!room) fail(400, 'انضم لغرفة أولًا');
      if (event.type === 'chat') {
        const text = clean(event.text, 500); if (!text) fail(400, 'الرسالة فارغة');
        const message = { id: randomUUID(), userId, name: user.name, text, at: now };
        room.messages = [...room.messages.slice(-99), message]; broadcast(room.id, { type: 'chat', message });
      } else if (event.type === 'media') { c.media = { audio: event.audio === true, video: room.mode === 'video' && event.video === true }; update(room); }
      else if (event.type === 'signal') {
        const target = Object.values(s.clients).find(p => p.roomId === room.id && p.userId === event.to && p.id !== c.id);
        if (!target) fail(400, 'المستقبل غير متاح');
        const d = event.data;
        if (!d || !(d.description && ['offer', 'answer'].includes(d.description.type) && typeof d.description.sdp === 'string' || d.candidate && typeof d.candidate.candidate === 'string')) fail(400, 'إشارة غير صالحة');
        emit(target, { type: 'signal', from: userId, data: d });
      } else if (event.type === 'gift') {
        const cost = { rose: 10, star: 50, crown: 100 }[event.gift];
        const target = people(room).find(p => p.id === event.to && p.id !== userId);
        if (!Number.isFinite(cost) || !target) fail(400, 'اختر هدية ومشاركًا آخر');
        if (user.balance < cost) fail(400, 'رصيدك التجريبي غير كافٍ');
        user.balance -= cost; broadcast(room.id, { type: 'gift', fromName: user.name, toName: target.name, gift: event.gift });
        Object.values(s.clients).filter(p => p.userId === userId).forEach(p => emit(p, { type: 'balance', balance: user.balance }));
        if (room.pk?.endsAt > now) { room.pk.sides.forEach(p => { if (p.id === target.id) p.score += cost; }); broadcast(room.id, { type: 'pk', pk: room.pk }); }
      } else if (event.type === 'pk-start') {
        if (room.host.id !== userId) fail(403, 'التحدي متاح للمضيف');
        const participants = people(room).sort((a, b) => Number(b.id === userId) - Number(a.id === userId));
        if (participants.length < 2 || room.pk?.endsAt > now) fail(409, 'التحدي يحتاج مشاركين ولا يمكن تكراره أثناء الجولة');
        room.pk = { endsAt: now + 60000, sides: participants.slice(0, 2).map(p => ({ id: p.id, name: p.name, score: 0 })) }; broadcast(room.id, { type: 'pk', pk: room.pk });
      } else fail(400, 'حدث غير معروف');
    }
  } catch (error) { if (!error.status) throw error; emit(c, { type: 'error', message: error.message }); }
  return { ok: true };
}
