import { pathToFileURL } from 'node:url';

const TIMEOUT_MS = 8_000;

async function fetchChecked(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('العنوان يجب أن يكون HTTP أو HTTPS دون بيانات دخول.');
  }
  return fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** A read-only liveness probe, not a database or gameplay readiness check. */
export async function probeServices({ webUrl, realtimeUrl, maxMs = 5000 }) {
  async function inspect(label, url, validate) {
    try {
      const started = performance.now();
      const response = await fetchChecked(url);
      const elapsed = Math.round(performance.now() - started);
      if (!response.ok) return { label, ok: false, detail: `HTTP ${response.status} · ${elapsed}ms` };
      const result = await validate(response);
      return { ...result, ok: result.ok && elapsed <= maxMs, detail: `${result.detail} · ${elapsed}ms${elapsed > maxMs ? ' · أبطأ من الحد المحدد' : ''}` };
    } catch {
      return { label, ok: false, detail: 'تعذّر الاتصال أو انتهت المهلة.' };
    }
  }
  return Promise.all([
    inspect('الموقع', webUrl, async (response) => ({
      label: 'الموقع',
      ok: (response.headers.get('content-type') || '').toLowerCase().includes('text/html'),
      detail: 'فحص استجابة الصفحة الرئيسية',
    })),
    inspect('اللعب المباشر', realtimeUrl, async (response) => {
      const body = await response.json();
      const ok = body && body.service === 'tahaddi-realtime' && body.status === 'ok';
      return { label: 'اللعب المباشر', ok: Boolean(ok), detail: ok ? 'استجابة الخدمة متاحة' : 'استجابة الخدمة غير متوقعة' };
    }),
  ]);
}

async function main() {
  const webUrl = process.env.TAHADDI_WEB_HEALTH_URL;
  const realtimeUrl = process.env.TAHADDI_REALTIME_HEALTH_URL;
  if (!webUrl || !realtimeUrl) {
    console.error('حدد TAHADDI_WEB_HEALTH_URL وTAHADDI_REALTIME_HEALTH_URL صراحةً.');
    process.exitCode = 2;
    return;
  }
  const maxMs = Number(process.env.TAHADDI_HEALTH_MAX_MS ?? 5000);
  if (!Number.isFinite(maxMs) || maxMs < 250 || maxMs > TIMEOUT_MS) {
    console.error(`TAHADDI_HEALTH_MAX_MS يجب أن يكون بين 250 و${TIMEOUT_MS}.`);
    process.exitCode = 2;
    return;
  }
  const results = await probeServices({ webUrl, realtimeUrl, maxMs });
  for (const result of results) console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.label}: ${result.detail}`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
