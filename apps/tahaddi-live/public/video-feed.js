import { icon } from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const numeral = value => Number(value).toLocaleString('ar-SA');
const cover = room => room.category === 'موسيقى' ? 1 : room.category === 'ألعاب' ? 2 : 0;
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(`wasl:${name}`, { detail }));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class VideoFeed {
  constructor() {
    this.container = document.querySelector('#video-feed');
    this.rooms = []; this.saved = []; this.visible = []; this.index = 0; this.savedOnly = false; this.active = true;
    this.currentId = null; this.fingerprint = '';
    this.container.addEventListener('scroll', () => this.onScroll(), { passive: true });
    document.querySelector('#feed-prev').addEventListener('click', () => this.go(this.index - 1));
    document.querySelector('#feed-next').addEventListener('click', () => this.go(this.index + 1));
    document.querySelector('#feed-tab-all').addEventListener('click', () => this.tab(false));
    document.querySelector('#feed-tab-saved').addEventListener('click', () => this.tab(true));
    document.querySelector('#video-search').addEventListener('input', () => this.render());
    document.querySelector('#video-create').addEventListener('click', () => emit('create-video'));
    document.addEventListener('click', event => this.click(event));
    window.addEventListener('keydown', event => this.key(event));
    this.resize = new ResizeObserver(() => this.align()); this.resize.observe(this.container);
  }

  setRooms(rooms, saved) {
    this.rooms = rooms.filter(room => room.mode === 'video'); this.saved = saved;
    const fingerprint = JSON.stringify([this.rooms, saved]);
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint; this.render();
  }
  setActive(value) { this.active = value; if (value) requestAnimationFrame(() => this.align()); }
  tab(saved) {
    this.savedOnly = saved;
    for (const [selector, selected] of [['#feed-tab-all', !saved], ['#feed-tab-saved', saved]]) {
      const button = document.querySelector(selector); button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    }
    this.render();
  }
  render() {
    const hadFocus = this.container.contains(document.activeElement);
    const focusedAction = hadFocus ? Object.entries(document.activeElement.dataset).find(([key]) => key.startsWith('feed')) : null;
    const query = document.querySelector('#video-search').value.trim().toLowerCase();
    this.visible = this.rooms.filter(room => (!this.savedOnly || this.saved.includes(room.id)) && `${room.title} ${room.category} ${room.host.name}`.toLowerCase().includes(query));
    const retained = this.visible.findIndex(room => room.id === this.currentId);
    this.index = retained < 0 ? 0 : retained;
    this.container.innerHTML = this.visible.length ? this.visible.map(room => this.slide(room)).join('') : `<div class="feed-empty">${icon('video')}<h2>${this.savedOnly ? 'على موجتك، قريبًا' : 'ما لقينا غرفة بهذا البحث'}</h2><p>${this.savedOnly ? 'احفظ غرف الفيديو من علامة القلب لتلقاها هنا.' : 'جرّب كلمة ثانية أو افتح أول غرفة لك.'}</p><button class="button primary" data-feed-create>افتح غرفة فيديو</button></div>`;
    this.align(); this.sync();
    if (hadFocus) {
      const replacement = focusedAction && [...this.container.querySelectorAll('button')].find(button => button.dataset[focusedAction[0]] === focusedAction[1] && button.tabIndex === 0);
      (replacement || this.container).focus({ preventScroll: true });
    }
  }
  slide(room) {
    const saved = this.saved.includes(room.id), full = room.count >= room.capacity;
    return `<article class="feed-slide" data-feed-room="${esc(room.id)}" aria-label="${esc(room.title)}"><div class="feed-cover cover-${cover(room)}" role="img" aria-label="غلاف توضيحي مولد، لا يمثل مضيف الغرفة أو بثًا مباشرًا"></div><div class="feed-shade"></div><div class="feed-topline"><span class="feed-status">${icon('video')}غرفة فيديو</span><span class="feed-viewers">${icon('people')}${numeral(room.count)} / ${numeral(room.capacity)}</span></div><span class="cover-disclaimer">غلاف توضيحي · ليس بثًا حيًا</span><div class="feed-action-rail"><button data-feed-save="${esc(room.id)}" class="${saved ? 'saved' : ''}" aria-label="${saved ? 'إلغاء حفظ' : 'حفظ'} ${esc(room.title)}" aria-pressed="${saved}">${icon('heart')}<span>${saved ? 'محفوظ' : 'متابعة'}</span></button><button data-feed-enter="${esc(room.id)}" aria-label="دخول محادثة ${esc(room.title)}">${icon('chat')}<span>محادثة</span></button><button data-feed-share="${esc(room.id)}" aria-label="مشاركة ${esc(room.title)}">${icon('share')}<span>مشاركة</span></button><button data-feed-enter="${esc(room.id)}" class="feed-join-circle" aria-label="انضم إلى ${esc(room.title)}">${icon('plus')}</button></div><div class="feed-overlay"><div class="feed-host"><span class="host-avatar">${esc(room.host.name[0])}</span><span><strong>${esc(room.host.name)}</strong><small>${room.id.startsWith('demo-') ? 'غرفة نموذجية مفتوحة للتجربة' : 'مضيف الغرفة'}</small></span><span class="feed-category"># ${esc(room.category)}</span></div><h2>${esc(room.title)}</h2><p>ناس جديدة، سوالف أقرب. خذ مكانك وخلّ اللحظة تبدأ.</p><button class="feed-enter" data-feed-enter="${esc(room.id)}" ${full ? 'disabled' : ''}>${full ? 'الغرفة مكتملة' : 'ادخل الغرفة'}${icon('arrow')}</button></div><div class="feed-slide-index" aria-hidden="true">WASL / LIVE ROOMS</div></article>`;
  }
  click(event) {
    const target = event.target.closest('button'); if (!target) return;
    if (target.hasAttribute('data-feed-enter')) emit('join', target.dataset.feedEnter);
    if (target.hasAttribute('data-feed-save')) emit('save', target.dataset.feedSave);
    if (target.hasAttribute('data-feed-share')) emit('share', target.dataset.feedShare);
    if (target.hasAttribute('data-feed-create')) emit('create-video');
    if (target.hasAttribute('data-feed-select')) this.go(this.visible.findIndex(room => room.id === target.dataset.feedSelect));
  }
  go(index) {
    if (!this.visible.length) return;
    this.index = Math.max(0, Math.min(index, this.visible.length - 1));
    this.currentId = this.visible[this.index].id;
    this.container.scrollTo({ top: this.index * this.container.clientHeight, behavior: reduced() ? 'instant' : 'smooth' });
    this.sync();
  }
  align() { this.container.scrollTo({ top: this.index * this.container.clientHeight, behavior: 'instant' }); }
  onScroll() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (!this.container.clientHeight || !this.visible.length) return;
      const index = Math.min(this.visible.length - 1, Math.max(0, Math.round(this.container.scrollTop / this.container.clientHeight)));
      if (index !== this.index) { this.index = index; this.sync(); }
    });
  }
  key(event) {
    if (!this.active || document.querySelector('dialog[open]') || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) return;
    event.preventDefault(); this.go(this.index + (['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1));
  }
  sync() {
    const room = this.visible[this.index]; this.currentId = room?.id || null;
    const focusedSlide = document.activeElement.closest('.feed-slide');
    if (focusedSlide && focusedSlide.dataset.feedRoom !== room?.id) this.container.focus({ preventScroll: true });
    document.querySelector('#feed-counter').textContent = this.visible.length ? `${numeral(this.index + 1)} / ${numeral(this.visible.length)}` : '٠ / ٠';
    document.querySelector('#feed-prev').disabled = !room || this.index === 0;
    document.querySelector('#feed-next').disabled = !room || this.index === this.visible.length - 1;
    this.container.querySelectorAll('.feed-slide').forEach((slide, i) => {
      const active = i === this.index; slide.setAttribute('aria-hidden', String(!active));
      slide.querySelectorAll('button').forEach(button => { button.tabIndex = active ? 0 : -1; });
    });
    document.querySelector('#feed-details').innerHTML = room ? this.details(room) : '<p class="sidecar-empty">كل غرفة لها حكاية.<br>اختر مساحتك لتبدأ.</p>';
    document.querySelector('#feed-room-list').innerHTML = this.visible.map((item, i) => `<button class="feed-room-option ${i === this.index ? 'active' : ''}" data-feed-select="${esc(item.id)}" aria-pressed="${i === this.index}"><span class="room-option-photo cover-${cover(item)}"></span><span><strong>${esc(item.title)}</strong><small>${esc(item.category)} · ${numeral(item.count)} مشاركين</small></span>${icon('chevron-down')}</button>`).join('');
  }
  details(room) {
    return `<span class="sidecar-eyebrow">في هذه الغرفة</span><div class="selected-host"><span class="host-avatar">${esc(room.host.name[0])}</span><div><h2>${esc(room.title)}</h2><p>مع ${esc(room.host.name)}</p></div></div><div class="selected-tags"><span>${icon('video')}فيديو</span><span>${icon('people')}${numeral(room.count)} / ٤</span><span>${esc(room.category)}</span></div><p class="selected-description">${esc(room.description || 'مساحة جديدة للقاء، والكلام على طبيعته.')}</p><button class="button primary full" data-feed-enter="${esc(room.id)}">ادخل وشارك اللحظة${icon('arrow')}</button><div class="feed-chat-invite">${icon('chat')}<span>المحادثة تبدأ من جوّا.<small>ادخل الغرفة لتكتب وترسل الهدايا.</small></span></div>`;
  }
}
