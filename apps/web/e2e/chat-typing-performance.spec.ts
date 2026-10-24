// Real room React tree with synthetic HTTP and AudioSession, not real audio E2E.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const stage = process.env.CHAT_TYPING_STAGE || 'after';
const output = process.env.CHAT_TYPING_EVIDENCE_DIR
  ? path.resolve(process.env.CHAT_TYPING_EVIDENCE_DIR)
  : path.resolve(process.cwd(), '../../docs/performance-evidence/live-chat-typing/artifacts');

for (const scenario of ['isolated', 'speaking'] as const) {
  test(`100 real keyboard characters with 200 messages (${scenario})`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let measured = false;
    const apiActivity: { method: string; pathname: string }[] = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' && !['data:', 'blob:'].includes(url.protocol))
        return route.abort();
      if (!url.pathname.startsWith('/api/voice/')) return route.continue();
      if (measured) apiActivity.push({ method: route.request().method(), pathname: url.pathname });
      const response = await route.fetch();
      const data = await response.json();
      if (Array.isArray(data.messages) && data.room) {
        data.participants[0].accountBadges = ['owner', 'verified'];
        data.messages = Array.from({ length: 200 }, (_, i) => ({
          ...data.messages[i % 2],
          id: `history-${i}`,
          text: `رسالة مجلس طويلة لاختبار سجل الدردشة الواقعي ${i} — أهلاً وسهلاً بأصدقاء تحدي لايف`,
          createdAt: 1792500000000 + i * 1000,
        }));
      }
      await route.fulfill({ response, json: data });
    });
    await page.goto('/');
    await page.locator('#voice-message').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const close = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
    if (await close.isVisible()) await close.click();
    await expect(page.locator('.v-message')).toHaveCount(200);
    await page.locator('#voice-message').focus();
    await page.waitForTimeout(150);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const before = await cdp.send('Performance.getMetrics');
    await page.evaluate(() => {
      const metrics = window.__typingMetrics;
      metrics.renders = {};
      metrics.commits = [];
      metrics.latencies = [];
      metrics.longTasks = [];
      metrics.speakerEvents = 0;
      metrics.active = true;
    });
    measured = true;
    const started = Date.now();
    const text = 'abcdefghijklmnopqrstuvwxyz'.repeat(3) + 'abcdefghijklmnopqrstuv';
    expect(text).toHaveLength(100);
    if (scenario === 'isolated') await page.keyboard.type(text, { delay: 0 });
    else {
      for (let batch = 0; batch < 10; batch++) {
        await page.evaluate((batch) => {
          window.__typingMetrics.speakerEvents++;
          window.dispatchEvent(
            new CustomEvent('live-room-speaking', { detail: batch % 2 ? [] : ['host'] }),
          );
        }, batch);
        await page.keyboard.type(text.slice(batch * 10, batch * 10 + 10), { delay: 0 });
      }
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const elapsedMs = Date.now() - started;
    measured = false;
    const after = await cdp.send('Performance.getMetrics');
    const metrics = await page.evaluate(() => {
      window.__typingMetrics.active = false;
      const input = document.getElementById('voice-message') as HTMLTextAreaElement;
      return {
        ...window.__typingMetrics,
        value: input.value,
        focused: document.activeElement === input,
        caret: input.selectionStart,
        userAgent: navigator.userAgent,
        devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
      };
    });
    const metricMap = (value: typeof before) =>
      Object.fromEntries(value.metrics.map(({ name, value }) => [name, value]));
    const a = metricMap(after);
    const b = metricMap(before);
    const cdpDeltas = Object.fromEntries(
      [
        'TaskDuration',
        'ScriptDuration',
        'LayoutDuration',
        'RecalcStyleDuration',
        'LayoutCount',
        'RecalcStyleCount',
        'JSHeapUsedSize',
      ].map((key) => [key, a[key] - b[key]]),
    );
    const sourceHashes: Record<string, string> = {};
    for (const file of ['voice-chat.tsx', 'voice-room.tsx']) {
      const source = await readFile(path.resolve(process.cwd(), 'src/components/voice', file));
      sourceHashes[file] = createHash('sha256').update(source).digest('hex');
    }
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, `${stage}-${scenario}.json`),
      JSON.stringify(
        {
          stage,
          scenario,
          browserName,
          viewport: { width: 1440, height: 900 },
          mode: 'Vite React development + Profiler + test-only render probes; no StrictMode',
          heartbeat:
            'Normal production timer; synthetic HTTP snapshot; no polling gates or timer changes',
          messageCount: 200,
          characters: 100,
          elapsedMs,
          apiRequests: apiActivity.length,
          apiActivity,
          sourceHashes,
          cdpDeltas,
          metrics,
          errors,
        },
        null,
        2,
      ),
    );
    if (scenario === 'isolated') {
      await page.screenshot({ path: path.join(output, `${stage}-1440x900.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'الدردشة', exact: true }).click();
      await page.screenshot({ path: path.join(output, `${stage}-390x844.png`) });
    }
    expect(metrics.value).toBe(text);
    expect(metrics.focused).toBe(true);
    expect(metrics.caret).toBe(100);
    expect(metrics.latencies).toHaveLength(100);
    expect(errors).toEqual([]);
  });
}
