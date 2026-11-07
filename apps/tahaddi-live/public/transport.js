// HTTP signaling survives serverless instance changes; audio itself uses WebRTC.
export class PollSocket extends EventTarget {
  readyState = 0; cursor = 0; chain = Promise.resolve(); stopped = false;
  constructor() { super(); queueMicrotask(() => this.open()); }
  async request(url, input) {
    const r = await fetch(url, input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(10000) } : { signal: AbortSignal.timeout(10000) });
    const data = await r.json(); if (!r.ok) throw Object.assign(new Error(data.error), { status: r.status }); return data;
  }
  async open() {
    try { const data = await this.request('/api/connect', {}); if (this.stopped) return; this.clientId = data.clientId; this.readyState = 1; this.lastSuccess = Date.now(); this.dispatchEvent(new Event('open')); this.poll(); }
    catch { this.fail(); }
  }
  async poll() {
    if (this.stopped) return;
    try {
      const data = await this.request(`/api/events?clientId=${this.clientId}&cursor=${this.cursor}`);
      if (this.stopped) return;
      this.lastSuccess = Date.now();
      for (const item of data.events) if (item.seq > this.cursor) { this.cursor = item.seq; this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(item.event) })); }
    } catch (error) { if (error.status === 401 || error.status === 409 || Date.now() - this.lastSuccess > 25000) { this.fail(); return; } }
    this.timer = setTimeout(() => this.poll(), 900);
  }
  send(raw) {
    if (this.readyState !== 1) return;
    const input = { clientId: this.clientId, requestId: crypto.randomUUID(), event: JSON.parse(raw) };
    this.chain = this.chain.then(async () => {
      if (this.stopped) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await this.request('/api/events', input); return; }
        catch (error) { if (error.status === 401 || error.status === 409) { this.fail(); return; } if (attempt === 2) this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'error', message: 'تعذّر إرسال الطلب. حاول مجددًا.' }) })); }
      }
    }).catch(() => this.fail());
  }
  fail() { if (this.stopped) return; this.stopped = true; this.readyState = 3; clearTimeout(this.timer); this.dispatchEvent(new Event('close')); }
  close() { if (this.clientId) navigator.sendBeacon('/api/disconnect', new Blob([JSON.stringify({ clientId: this.clientId })], { type: 'application/json' })); this.fail(); }
}
