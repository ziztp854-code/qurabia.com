import { icon, renderIcons } from './icons.js';
import { MediaSession } from './media.js';
import { PollSocket } from './transport.js';
import { VideoFeed } from './video-feed.js';

const $ = selector => document.querySelector(selector);
const number = value => Number(value).toLocaleString('ar-SA');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { user: null, socket: null, rooms: [], room: null, users: [], page: 'video', roomReturn: 'video', filter: 'all', saved: [], streams: new Map(), connection: new Map(), pk: null, joinPending: false };
try { state.saved = JSON.parse(localStorage.getItem('wasl-saved') || '[]'); if (!Array.isArray(state.saved)) state.saved = []; } catch { state.saved = []; }
let toastTimer, reconnectTimer;
let cloudConfig = { transport: 'websocket', iceServers: [] };
const media = new MediaSession({ send, onRemote: remoteStream, onState: (id, connection) => { state.connection.set(id, connection); renderParticipants(); } });
const videoFeed = new VideoFeed();
document.querySelector('.sidebar').insertBefore(document.querySelector('.feed-sidecar'), document.querySelector('.sidebar-bottom'));
document.querySelector('.sidebar').insertBefore(document.querySelector('.sidebar-note'), document.querySelector('.sidebar nav'));

function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.message || 'تعذّر إكمال الطلب، حاول مجددًا.');
  return result;
}
function send(value) {
  if (state.socket?.readyState !== WebSocket.OPEN) { toast('الاتصال بالخادم غير متاح. جارٍ إعادة المحاولة.'); return false; }
  state.socket.send(JSON.stringify(value));
  return true;
}
function balance(value) {
  if (!state.user) return;
  state.user = { ...state.user, balance: value };
  $('#balance').textContent = number(value);
  $('#profile-balance').textContent = number(value);
}
function renderUser() {
  $('#profile-name').value = state.user.name;
  document.querySelectorAll('.self-avatar').forEach(el => { el.textContent = state.user.name[0]; });
  balance(state.user.balance);
}
async function loadRooms() {
  try {
    state.rooms = (await api('/api/rooms')).rooms;
    renderRooms();
  } catch (error) { $('#room-grid').innerHTML = `<p class="empty">${escape(error.message)}</p>`; }
}
function roomCard(room, i) {
  const theme = { violet: 'dusk', blue: 'ocean', amber: 'sand', rose: 'rose' }[room.theme] || ['dusk', 'sand', 'ocean', 'rose'][i % 4];
  const symbol = { 'موسيقى': 'music', 'ألعاب': 'game', 'سفر': 'globe', 'سوالف': 'coffee', 'دردشة': 'coffee' }[room.category] || 'mic';
  const saved = state.saved.includes(room.id), demo = room.id.startsWith('demo-');
  return `<article class="room-card"><div class="room-art" data-theme="${theme}"><span class="art-orbit"></span><span class="art-symbol">${icon(symbol)}</span><span class="room-type">${icon(room.mode === 'video' ? 'video' : 'headphones')}${room.mode === 'video' ? 'بث مرئي' : 'غرفة صوتية'}</span><button class="save-room ${saved ? 'saved' : ''}" data-save="${escape(room.id)}" aria-label="${saved ? 'إلغاء حفظ' : 'حفظ'} ${escape(room.title)}" aria-pressed="${saved}">${icon('heart')}</button><span class="art-caption">${escape(room.category)}${demo ? ' · غرفة تجريبية' : ''}</span></div><div class="room-info"><h3>${escape(room.title)}</h3><div class="room-meta"><span>${escape(room.host.name)}</span><span>${icon('people')}${number(room.count)} / ${number(room.capacity)}</span></div><button class="room-enter" data-join="${escape(room.id)}">${room.count >= room.capacity ? 'الغرفة مكتملة' : 'ادخل السالفة'}${icon('arrow')}</button></div></article>`;
}
function renderRooms() {
  const query = $('#room-search').value.trim().toLowerCase();
  const filtered = state.rooms.filter(room => (state.filter === 'all' || room.mode === state.filter) && `${room.title} ${room.category} ${room.host.name}`.toLowerCase().includes(query));
  $('#room-count').textContent = `${number(state.rooms.length)} مساحات متاحة`;
  $('#room-grid').innerHTML = filtered.length ? filtered.map(roomCard).join('') : '<p class="empty">ما لقينا غرفة بهذا الاسم. جرّب بحثًا آخر أو افتح غرفتك.</p>';
  const following = state.rooms.filter(room => state.saved.includes(room.id));
  $('#following-grid').innerHTML = following.length ? following.map(roomCard).join('') : '<p class="empty">احفظ الغرف التي تعجبك بالضغط على القلب، وتلقاها هنا.</p>';
  videoFeed.setRooms(state.rooms, state.saved);
}
function page(name) {
  if (state.page === 'clips' && name !== 'clips') $('#clips-grid').querySelectorAll('video').forEach(video => video.pause());
  if (state.room && name !== 'room') leaveRoom(false);
  state.page = name;
  document.body.classList.toggle('view-video', name === 'video');
  document.body.classList.toggle('view-room', name === 'room');
  videoFeed.setActive(name === 'video');
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== `${name}-page`; });
  document.querySelectorAll('[data-page]').forEach(el => {
    const active = el.dataset.page === name;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = { video: 'غرف الفيديو', discover: 'اكتشف', following: 'أتابعهم', clips: 'المقاطع القصيرة', profile: 'حسابي', room: 'الغرفة' }[name];
  if (name === 'clips') loadClips();
  if (name !== 'room') { history.replaceState(null, '', location.pathname); loadRooms(); }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function connect() {
  clearTimeout(reconnectTimer);
  const socket = cloudConfig.transport === 'poll' ? new PollSocket() : new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  state.socket = socket;
  socket.addEventListener('open', () => {
    $('#connection-dot').classList.add('online');
    $('#connection-label').textContent = 'متصل بتحدي لايف';
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash.startsWith('room/')) joinRoom(hash.slice(5));
  });
  socket.addEventListener('message', event => { try { onEvent(JSON.parse(event.data)); } catch (error) { console.error('حدث غير صالح', error); } });
  socket.addEventListener('close', () => {
    $('#connection-dot').classList.remove('online');
    $('#connection-label').textContent = 'جارٍ إعادة الاتصال';
    state.joinPending = false;
    if (state.room) { leaveRoom(false); page('discover'); toast('انقطع الاتصال. أوقفنا الأجهزة، ويمكنك الانضمام مجددًا.'); }
    reconnectTimer = setTimeout(connect, 2500);
  });
  socket.addEventListener('error', () => { $('#connection-label').textContent = 'الخادم غير متاح'; });
}
function joinRoom(id) {
  if (!id || state.joinPending) return;
  if (state.room?.id === id) return;
  if (!state.room) state.roomReturn = state.page === 'video' ? 'video' : 'discover';
  if (state.room) leaveRoom(false);
  if (send({ type: 'join', roomId: id })) state.joinPending = true;
}
function onEvent(event) {
  switch (event.type) {
    case 'joined':
      state.joinPending = false;
      media.close(); state.streams.clear(); state.connection.clear();
      state.room = event.room; state.users = event.users; state.pk = event.pk; media.selfId = event.selfId;
      $('#room-page').dataset.mode = event.room.mode;
      $('#room-page').dataset.roomId = event.room.id;
      $('#room-current-tab').textContent = event.room.mode === 'voice' ? 'غرف الصوت' : 'غرف الفيديو';
      $('.presenter-name').textContent = event.room.title;
      $('#active-room-title').textContent = event.room.title;
      $('#room-mode-label').textContent = event.room.mode === 'video' ? 'غرفة مرئية' : 'غرفة صوتية';
      $('#chat-messages').replaceChildren();
      chatSystem('أهلًا بك! مساحة آمنة تبدأ بكلمة طيبة.');
      (event.messages || []).forEach(addMessage);
      resetControls(); page('room'); renderParticipants(); renderPK();
      history.replaceState(null, '', `#room/${event.room.id}`);
      state.users.filter(user => user.id !== event.selfId).forEach(user => media.peer(user.id, true));
      break;
    case 'room-update':
      if (state.room?.id === event.room.id) { state.room = event.room; state.users = event.users; renderParticipants(); }
      break;
    case 'peer-joined': chatSystem(`${event.user.name} انضم للسالفة`); break;
    case 'peer-left':
      media.remove(event.userId); state.streams.delete(event.userId); state.connection.delete(event.userId);
      document.getElementById(`remote-${event.userId}`)?.remove(); break;
    case 'signal': if (state.room) media.signal(event.from, event.data); break;
    case 'chat': addMessage(event.message); break;
    case 'balance': balance(event.balance); break;
    case 'gift':
      chatSystem(`${event.fromName} أرسل ${ { rose: 'وردة', star: 'نجمة', crown: 'تاجًا' }[event.gift] || 'هدية' } إلى ${event.toName}`);
      if (event.balance !== undefined) balance(event.balance);
      $('#gift-dialog').close(); break;
    case 'pk': state.pk = event.pk; renderPK(); break;
    case 'error':
      state.joinPending = false;
      toast(event.message || event.error || 'تعذّر إكمال العملية');
      if ($('#gift-dialog').open) $('#gift-error').textContent = event.message || event.error;
      break;
    case 'left': break;
  }
}
function renderParticipants() {
  if (!state.room) return;
  $('#participant-count').textContent = `${number(state.users.length)} / ٤ أشخاص`;
  const elements = state.users.map(user => {
    const self = user.id === state.user.id;
    const stream = self ? media.stream : state.streams.get(user.id);
    const connection = state.connection.get(user.id);
    const note = self ? 'أنت' : connection === 'connected' ? 'متصل مباشرة' : connection === 'failed' ? 'تعذّر اتصال الوسائط' : stream ? 'متصل' : 'مستمع';
    return `<div class="participant" data-user="${escape(user.id)}">${stream && user.media?.video ? `<video id="video-${escape(user.id)}" autoplay playsinline muted></video>` : `<span class="avatar">${escape(user.name[0])}</span>`}<h3>${escape(user.name)}${user.id === state.room.host.id ? ' · المضيف' : ''}</h3><span class="seat-note">${icon(user.media?.audio ? 'mic' : 'mute')}${note}</span></div>`;
  });
  for (let i = state.users.length; i < 4; i++) elements.push(`<div class="participant empty-seat"><span class="avatar">+</span><span class="seat-note">مكان لصوت جديد</span></div>`);
  $('#participants').innerHTML = elements.join('');
  state.users.forEach(user => {
    const element = document.getElementById(`video-${user.id}`), stream = user.id === state.user.id ? media.stream : state.streams.get(user.id);
    if (element && stream) { element.srcObject = stream; element.play().catch(() => {}); }
  });
  $('#start-pk').hidden = state.room.host.id !== state.user.id || state.users.length < 2 || !!(state.pk && state.pk.endsAt > Date.now());
}
function remoteStream(id, stream) {
  state.streams.set(id, stream);
  let audio = document.getElementById(`remote-${id}`);
  if (!audio) { audio = document.createElement('audio'); audio.id = `remote-${id}`; audio.autoplay = true; $('#remote-media').append(audio); }
  audio.srcObject = stream;
  audio.play().catch(() => toast('اضغط تشغيل الميكروفون للسماح بتشغيل صوت الغرفة.'));
  renderParticipants();
}
function resetControls() {
  $('#enable-media').hidden = false;
  $('#enable-media').disabled = false;
  $('#enable-media').innerHTML = `${icon('mic')}${state.room?.mode === 'video' ? 'تشغيل الكاميرا والميكروفون' : 'تشغيل الميكروفون'}`;
  $('#toggle-mic').hidden = true; $('#toggle-camera').hidden = true;
  $('#media-hint').textContent = 'تدخل كمستمع. شغّل الميكروفون عندما تكون مستعدًا.';
}
async function enableMedia() {
  $('#enable-media').disabled = true;
  try {
    const stream = await media.enable(state.room.mode);
    if (!stream || !state.room) return;
    $('#enable-media').hidden = true; $('#toggle-mic').hidden = false;
    $('#toggle-camera').hidden = state.room.mode !== 'video';
    updateTracks();
    $('#media-hint').textContent = 'أجهزتك تعمل. الصوت والفيديو يصلان فقط للموجودين في الغرفة.';
    $('#remote-media').querySelectorAll('audio').forEach(audio => audio.play().catch(() => {}));
  } catch (error) {
    const message = error.name === 'NotAllowedError' ? 'لم تسمح باستخدام الميكروفون أو الكاميرا. غيّر إذن الموقع ثم حاول مجددًا.' : error.name === 'NotFoundError' ? 'لم نجد جهاز صوت أو كاميرا. وصّل جهازك ثم حاول مجددًا.' : error.message;
    $('#media-hint').textContent = message; toast(message);
  } finally { $('#enable-media').disabled = false; }
}
function updateTracks() {
  if (!media.stream) return;
  const audio = media.stream.getAudioTracks().some(track => track.enabled), video = media.stream.getVideoTracks().some(track => track.enabled);
  $('#toggle-mic').innerHTML = `${icon(audio ? 'mic' : 'mute')}${audio ? 'كتم الصوت' : 'إلغاء الكتم'}`;
  $('#toggle-mic').setAttribute('aria-pressed', String(!audio));
  $('#toggle-camera').innerHTML = `${icon(video ? 'video' : 'video-off')}${video ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}`;
  $('#toggle-camera').setAttribute('aria-pressed', String(!video));
  send({ type: 'media', audio, video });
  state.users = state.users.map(user => user.id === state.user.id ? { ...user, media: { audio, video } } : user);
  renderParticipants();
}
function leaveRoom(navigate = true) {
  send({ type: 'leave' }); media.close(); state.streams.clear(); state.connection.clear();
  $('#remote-media').querySelectorAll('audio').forEach(audio => { audio.srcObject = null; });
  $('#participants').querySelectorAll('video').forEach(video => { video.srcObject = null; });
  $('#remote-media').replaceChildren(); state.room = null; state.pk = null; state.users = []; state.joinPending = false;
  history.replaceState(null, '', location.pathname);
  if (navigate) { page(state.roomReturn); toast('غادرت الغرفة وأوقفنا الميكروفون والكاميرا.'); }
}
function addMessage(message) {
  const row = document.createElement('div');
  row.className = `chat-message${message.userId === state.user.id ? ' mine' : ''}`;
  const name = document.createElement('strong'); name.textContent = message.name;
  const text = document.createElement('span'); text.textContent = message.text;
  row.append(name, text); $('#chat-messages').append(row); scrollChat();
}
function chatSystem(text) {
  const row = document.createElement('div'); row.className = 'chat-message system'; row.textContent = text;
  $('#chat-messages').append(row); scrollChat();
}
function scrollChat() {
  const messages = $('#chat-messages');
  while (messages.children.length > 110) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
}
function renderPK() {
  const panel = $('#pk-panel'), pk = state.pk;
  panel.hidden = !pk;
  if (!pk) return;
  const [left, right] = pk.sides;
  const seconds = Math.max(0, Math.ceil((pk.endsAt - Date.now()) / 1000));
  if (!seconds && state.room) $('#start-pk').hidden = state.room.host.id !== state.user.id || state.users.length < 2;
  const percent = left.score + right.score ? (left.score / (left.score + right.score)) * 100 : 50;
  panel.innerHTML = `<h3>تحدي PK · ${seconds ? `${number(seconds)} ثانية` : 'انتهى التحدي'}</h3><div class="pk-sides"><span>${escape(left.name)}<b>${number(left.score)}</b></span><span>${escape(right.name)}<b>${number(right.score)}</b></span></div><div class="pk-bar"><span style="width:${percent}%"></span></div>`;
}
async function loadClips() {
  try {
    $('#clips-grid').querySelectorAll('video').forEach(video => video.pause());
    const { clips } = await api('/api/clips');
    $('#clips-grid').innerHTML = clips.length ? clips.map(clip => `<article class="clip-card"><video src="${escape(clip.url)}" controls playsinline preload="metadata"></video><h2>${escape(clip.title)}</h2><p>${escape(clip.name)}</p></article>`).join('') : '<div class="empty">أول لحظة تبدأ منك. شارك مقطعًا قصيرًا ليظهر هنا.<br>تقبل هذه النسخة ملفات MP4 وWebM المحفوظة على جهازك.</div>';
  } catch (error) { toast(error.message); }
}
function saveRoom(id) {
  state.saved = state.saved.includes(id) ? state.saved.filter(value => value !== id) : [...state.saved, id];
  try { localStorage.setItem('wasl-saved', JSON.stringify(state.saved)); } catch { toast('تعذّر حفظ الغرف في هذا المتصفح.'); }
  renderRooms();
}

document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) page(pageButton.dataset.page);
  if (event.target.closest('[data-action="create"]')) { $('#create-error').textContent = ''; $('#create-dialog').showModal(); }
  const closeButton = event.target.closest('[data-close]');
  if (closeButton) closeButton.closest('dialog').close();
  const joinButton = event.target.closest('[data-join]');
  if (joinButton) joinRoom(joinButton.dataset.join);
  const saveButton = event.target.closest('[data-save]');
  if (saveButton) saveRoom(saveButton.dataset.save);
  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(button => { button.classList.toggle('active', button === filterButton); button.setAttribute('aria-pressed', String(button === filterButton)); });
    renderRooms();
  }
  const giftButton = event.target.closest('[data-gift]');
  if (giftButton) send({ type: 'gift', gift: giftButton.dataset.gift, to: $('#gift-recipient').value });
});
window.addEventListener('wasl:join', event => joinRoom(event.detail));
window.addEventListener('wasl:save', event => saveRoom(event.detail));
window.addEventListener('wasl:create-video', () => {
  $('#create-form').reset();
  $('#create-form input[value="video"]').checked = true;
  $('#create-error').textContent = '';
  $('#create-dialog').showModal();
});
window.addEventListener('wasl:share', async event => {
  const link = `${location.origin}${location.pathname}#room/${event.detail}`;
  try { await navigator.clipboard.writeText(link); toast('نُسخ رابط الغرفة'); } catch { toast(link); }
});
$('#room-search').addEventListener('input', renderRooms);
$('#browse-chat-enter').addEventListener('click', () => { if (videoFeed.currentId) joinRoom(videoFeed.currentId); });
$('#studio-gift-enter').addEventListener('click', () => { if (videoFeed.currentId) joinRoom(videoFeed.currentId); });
document.querySelectorAll('[data-preview-gift]').forEach(button => button.addEventListener('click', () => toast('ادخل الغرفة أولًا واختر المستلم لإرسال الهدية.')));
document.querySelectorAll('[data-room-gift]').forEach(button => button.addEventListener('click', () => {
  $('#gift-open').click();
  if ($('#gift-dialog').open) document.querySelector(`[data-gift="${button.dataset.roomGift}"]`).focus();
}));
$('#room-share-control').addEventListener('click', () => $('#copy-room').click());
$('#room-invite-control').addEventListener('click', () => $('#copy-room').click());
$('#explore-rooms').addEventListener('click', () => $('#rooms-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
$('#join-code-form').addEventListener('submit', event => { event.preventDefault(); const value = $('#room-code').value.trim(); joinRoom(value.includes('#room/') ? value.split('#room/')[1] : value); });
$('#create-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    const { room } = await api('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: $('#create-title').value, category: $('#create-category').value, mode: new FormData(event.target).get('mode'), theme: 'violet' }) });
    $('#create-dialog').close(); event.target.reset(); await loadRooms(); joinRoom(room.id);
  } catch (error) { $('#create-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { state.user = (await api('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#profile-name').value }) })).user; renderUser(); toast('تم حفظ اسمك'); } catch (error) { toast(error.message); }
});
$('#leave-room').addEventListener('click', () => leaveRoom());
$('#copy-room').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}/#room/${state.room.id}`); toast('نُسخ رابط الغرفة. أرسله لأصحابك.'); } catch { toast(`رمز الغرفة: ${state.room.id}`); } });
$('#enable-media').addEventListener('click', enableMedia);
$('#toggle-mic').addEventListener('click', () => { media.stream?.getAudioTracks().forEach(track => { track.enabled = !track.enabled; }); updateTracks(); });
$('#toggle-camera').addEventListener('click', () => { media.stream?.getVideoTracks().forEach(track => { track.enabled = !track.enabled; }); updateTracks(); });
$('#chat-form').addEventListener('submit', event => { event.preventDefault(); const text = $('#chat-input').value.trim(); if (text && send({ type: 'chat', text })) $('#chat-input').value = ''; });
$('#start-pk').addEventListener('click', () => send({ type: 'pk-start' }));
$('#gift-open').addEventListener('click', () => {
  const users = state.users.filter(user => user.id !== state.user.id);
  if (!users.length) return toast('ادعُ شخصًا للغرفة لتجربة الهدايا.');
  $('#gift-recipient').innerHTML = users.map(user => `<option value="${escape(user.id)}">${escape(user.name)}</option>`).join('');
  $('#gift-error').textContent = ''; $('#gift-dialog').showModal();
});
$('#upload-open').addEventListener('click', () => { $('#upload-error').textContent = ''; $('#upload-dialog').showModal(); });
$('#upload-form').addEventListener('submit', async event => {
  event.preventDefault(); const file = $('#clip-file').files[0], button = event.submitter;
  if (!file || file.size > 20 * 1024 * 1024) { $('#upload-error').textContent = 'اختر فيديو لا يتجاوز ٢٠ ميغابايت.'; return; }
  button.disabled = true; button.textContent = 'جارٍ رفع المقطع…';
  try { await api('/api/clips', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Clip-Title': encodeURIComponent($('#clip-title').value) }, body: file }); $('#upload-dialog').close(); event.target.reset(); await loadClips(); toast('تمت مشاركة المقطع'); } catch (error) { $('#upload-error').textContent = error.message; } finally { button.disabled = false; button.textContent = 'مشاركة المقطع'; }
});
window.addEventListener('pagehide', () => { media.close(); state.socket?.close(); });
window.addEventListener('hashchange', () => { const value = decodeURIComponent(location.hash.slice(1)); if (value.startsWith('room/')) joinRoom(value.slice(5)); else if (state.room) leaveRoom(); });
setInterval(() => { if (state.page !== 'room') loadRooms(); }, 20000);
setInterval(() => { if (state.pk) renderPK(); }, 1000);
renderIcons();
page('discover');
try { cloudConfig = await api('/api/config'); media.iceServers = cloudConfig.iceServers || []; } catch {}
try { state.user = (await api('/api/session')).user; renderUser(); await loadRooms(); connect(); } catch (error) { toast(error.message); $('#connection-label').textContent = 'تعذّر الاتصال'; }
