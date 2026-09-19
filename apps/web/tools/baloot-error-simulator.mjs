#!/usr/bin/env node
/**
 * Baloot Error Simulator (محاكي اكتشاف الأخطاء)
 *
 * Runs chaos-engineering scenarios against /games/baloot to surface
 * unhandled errors, broken UX, validation gaps, and resilience issues.
 *
 * Usage:
 *   node tools/baloot-error-simulator.mjs            # tests live deployment
 *   BASE_URL=http://127.0.0.1:3000 node tools/baloot-error-simulator.mjs
 *
 * Output: console summary + tools/.reports/baloot-<timestamp>.json
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://qurabia.com';
const PATH = '/games/baloot';
const URL = `${BASE}${PATH}`;
const OUT = join(process.cwd(), '.reports');
mkdirSync(OUT, { recursive: true });

/** @type {import('playwright').ConsoleMessage[]} */
const consoleLog = [];
/** @type {Error[]} */
const pageErrors = [];
/** @type {string[]} */
const requestFailures = [];
/**
 * @typedef {Object} ScenarioResult
 * @property {string} id
 * @property {string} title
 * @property {'pass'|'fail'|'warn'} status
 * @property {string} summary
 * @property {string[]} evidence
 * @property {string} [screenshot]
 */

/** @type {ScenarioResult[]} */
const results = [];

function recordConsole(page) {
  page.on('console', (msg) => {
    consoleLog.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => pageErrors.push(err));
  page.on('requestfailed', (req) => requestFailures.push(req.url() + ' :: ' + (req.failure()?.errorText ?? '?')));
  page.on('response', (res) => {
    if (res.status() >= 500) requestFailures.push(`${res.status()} :: ${res.url()}`);
  });
}

/** Wrap a scenario so any thrown error is captured as a "fail" result. */
async function runScenario(id, title, fn) {
  const errors = [];
  const evidence = [];
  const start = Date.now();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ar-SA',
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  recordConsole(page);

  let screenshot;
  let summary = '';
  let status = 'pass';
  try {
    const result = await fn(page, { evidence, errors });
    if (result?.screenshot) screenshot = result.screenshot;
    if (result?.summary) summary = result.summary;
    if (result?.status) status = result.status;
  } catch (e) {
    status = 'fail';
    summary = `رمي استثناء غير مُعالَج: ${e.message}`;
    evidence.push(`Exception: ${e.stack ?? e.message}`);
  }
  const duration = Date.now() - start;
  if (errors.length) {
    for (const err of errors.slice(0, 5)) evidence.push(`console.error: ${err}`);
    if (status === 'pass') status = 'warn';
  }
  if (!screenshot) {
    screenshot = join(OUT, `${id}.png`);
    try {
      await page.screenshot({ path: screenshot, fullPage: false });
    } catch {}
  }
  results.push({ id, title, status, summary, evidence, screenshot });
  await browser.close();
  return { id, status, duration };
}

// ─────────────────────────────────────────────────────────────
//  Scenarios
// ─────────────────────────────────────────────────────────────

await runScenario('S01-page-load', 'تحميل الصفحة بدون أخطاء وحدة التحكم', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[class*="lobbyShell"], [class*="felt"]', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(1500);
  // Page must render the title and the lobby shell
  const title = await page.title();
  const hasLobby = await page.locator('[class*="lobbyShell"]').count();
  if (!hasLobby) {
    return { status: 'fail', summary: 'لم يظهر هيكل اللوبي' };
  }
  return { status: 'pass', summary: `العنوان: ${title}` };
});

await runScenario('S02-empty-name-submit', 'منع إنشاء مجلس باسم فارغ', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form', { timeout: 15000 });
  // Click submit without filling name
  const submit = page.locator('button[type="submit"]').first();
  await submit.click({ force: true });
  await page.waitForTimeout(700);
  // Form should still be visible (HTML5 required validation prevents submit)
  const stillOnLobby = await page.locator('[class*="lobbyShell"]').count();
  if (!stillOnLobby) return { status: 'fail', summary: 'تم إرسال النموذج بدون اسم' };
  // Check that the name input has the :invalid state
  const nameInput = page.locator('input[name="playerName"]').first();
  const validity = await nameInput.evaluate((el) => ({
    valid: el.checkValidity(),
    message: el.validationMessage,
  }));
  if (validity.valid) return { status: 'fail', summary: 'HTML5 validation لم يمنع الإرسال' };
  return { status: 'pass', summary: `تم المنع: "${validity.message}"` };
});

await runScenario('S03-xss-in-name', 'حماية من حقن HTML في اسم اللاعب', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="playerName"]', { timeout: 15000 });
  const payload = '<img src=x onerror=window.__pwn=1>';
  await page.locator('input[name="playerName"]').fill(payload);
  await page.waitForTimeout(500);
  const injected = await page.evaluate(() => Boolean(window.__pwn));
  if (injected) {
    return { status: 'fail', summary: 'نجح حقن XSS في حقل الإدخال' };
  }
  return { status: 'pass', summary: 'الحقل آمن من XSS' };
});

await runScenario('S04-very-long-name', 'تقصير اسم اللاعب الطويل جداً', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="playerName"]', { timeout: 15000 });
  const longName = 'أ'.repeat(500);
  await page.locator('input[name="playerName"]').fill(longName);
  await page.waitForTimeout(300);
  const actualLength = await page.locator('input[name="playerName"]').inputValue();
  if (actualLength.length > 50) {
    return { status: 'warn', summary: `الاسم المقبول ${actualLength.length} حرف (لا يوجد maxLength على الـ React state)` };
  }
  return { status: 'pass', summary: `تم تقييد الاسم إلى ${actualLength.length} حرف` };
});

await runScenario('S05-room-code-special-chars', 'تقييد رمز المجلس للأرقام فقط', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="playerName"]', { timeout: 15000 });
  // Switch to join-by-code mode
  await page.locator('button:has-text("دخول برمز")').first().click();
  await page.waitForTimeout(300);
  const codeInput = page.locator('input[name="roomCode"]');
  await codeInput.fill('abc<script>alert(1)</script>123');
  await page.waitForTimeout(300);
  const value = await codeInput.inputValue();
  if (/[a-z<>()]/.test(value)) {
    return { status: 'fail', summary: `الرمز قبل حروف غير رقمية: "${value}"` };
  }
  if (value.length > 6) {
    return { status: 'warn', summary: `الرمز قبل ${value.length} أحرف بدلاً من 6` };
  }
  return { status: 'pass', summary: `الرمز المُقبول: "${value}"` };
});

await runScenario('S06-localstorage-tamper', 'مقاومة التلاعب بـ localStorage', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form', { timeout: 15000 });
  // Inject a forged session token
  await page.evaluate(() => {
    localStorage.setItem('tahaddi-baloot-session-token', 'forged-token');
    localStorage.setItem('tahaddi-baloot-room-code', '999999');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form', { timeout: 15000 });
  // The page should still show the lobby (forged token should be rejected)
  const lobby = await page.locator('[class*="lobbyShell"]').count();
  const inGame = await page.locator('[class*="felt"]').count();
  if (lobby && !inGame) {
    return { status: 'pass', summary: 'تم رفض الرمز المُزوَّر وعرض اللوبي' };
  }
  return { status: 'fail', summary: 'دخل اللاعب بحالة مزورة' };
});

await runScenario('S07-network-offline', 'التعافي من فقدان الشبكة', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[class*="lobbyShell"]', { timeout: 15000 });
  // Cut the network
  await page.context().setOffline(true);
  await page.waitForTimeout(1500);
  // Try to submit a session
  await page.locator('input[name="playerName"]').fill('محمد');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(1500);
  // The button should be disabled or show an error
  const submitButton = page.locator('button[type="submit"]').first();
  const disabled = await submitButton.isDisabled();
  const error = await page.locator('[role="alert"]').count();
  await page.context().setOffline(false);
  if (disabled || error > 0) {
    return { status: 'pass', summary: disabled ? 'الزر معطّل بدون شبكة' : 'ظهور رسالة خطأ' };
  }
  return { status: 'warn', summary: 'لم يُظهر تعافي ملحوظ من فقدان الشبكة' };
});

await runScenario('S08-slow-network', 'التعامل مع الشبكة البطيئة (throttling)', async (page) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (200 * 1024) / 8, // 200 kbps
    uploadThroughput: (200 * 1024) / 8,
    latency: 2000,
  });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[class*="lobbyShell"]', { timeout: 30000 }).catch(() => null);
  const elapsed = Date.now() - t0;
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });
  if (elapsed > 30000) {
    return { status: 'fail', summary: `التحميل استغرق ${elapsed}ms` };
  }
  return { status: 'pass', summary: `التحميل اكتمل في ${elapsed}ms` };
});

await runScenario('S09-rate-limit', 'اكتشاف حماية معدل الإرسال', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="playerName"]', { timeout: 15000 });
  const submit = page.locator('button[type="submit"]').first();
  // Rapid-fire 30 clicks to stress rate limiting
  for (let i = 0; i < 30; i += 1) {
    await page.locator('input[name="playerName"]').fill('محمد');
    await submit.click({ force: true, noWaitAfter: true }).catch(() => null);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(2000);
  const errorText = await page.locator('[role="alert"]').textContent().catch(() => '');
  if (errorText && /كثير|معدل|تجاوز|rate/i.test(errorText)) {
    return { status: 'pass', summary: `حماية معدل مفعّلة: "${errorText.trim().slice(0, 60)}"` };
  }
  return { status: 'warn', summary: 'لا توجد رسالة rate-limit صريحة' };
});

await runScenario('S10-multiple-tabs', 'مزامنة localStorage بين التبويبات', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form', { timeout: 15000 });
  // Set a token in this tab
  await page.evaluate(() => {
    localStorage.setItem('tahaddi-baloot-session-token', 'tab1-token');
  });
  // Open a second tab
  const second = await page.context().newPage();
  await second.goto(URL, { waitUntil: 'domcontentloaded' });
  await second.waitForSelector('form', { timeout: 15000 });
  // Both tabs should reflect the same state
  const t1 = await page.evaluate(() => localStorage.getItem('tahaddi-baloot-session-token'));
  const t2 = await second.evaluate(() => localStorage.getItem('tahaddi-baloot-session-token'));
  if (t1 === t2 && t1 === 'tab1-token') {
    return { status: 'pass', summary: 'التزامن يعمل بين التبويبات' };
  }
  return { status: 'warn', summary: `اختلاف في localStorage بين التبويبات: t1=${t1} t2=${t2}` };
});

await runScenario('S11-image-404', 'تحمّل صور/أصول مفقودة', async (page) => {
  /** @type {string[]} */
  const failed = [];
  page.on('response', (res) => {
    if (res.status() === 404) failed.push(res.url());
  });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2000);
  // Filter out 404s that are intentional (e.g. workflow v1 manifest)
  const relevant = failed.filter((u) => !u.includes('.well-known/workflow'));
  if (relevant.length > 0) {
    return { status: 'warn', summary: `${relevant.length} أصل مفقود: ${relevant[0]}` };
  }
  return { status: 'pass', summary: 'كل الأصول الحرجة تُحمَّل بنجاح' };
});

await runScenario('S12-memory-leak', 'كشف تسرّب الذاكرة بعد التنقل', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[class*="lobbyShell"]', { timeout: 15000 });
  // Measure initial heap
  const heap1 = await page.evaluate(() => {
    if ('memory' in performance) {
      // @ts-expect-error - performance.memory is non-standard
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  });
  // Navigate away and back 5 times
  for (let i = 0; i < 5; i += 1) {
    await page.goto(`${BASE}/games/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  const heap2 = await page.evaluate(() => {
    if ('memory' in performance) {
      // @ts-expect-error - performance.memory is non-standard
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  });
  if (heap1 === 0) {
    return { status: 'warn', summary: 'performance.memory غير متاح' };
  }
  const growth = ((heap2 - heap1) / heap1) * 100;
  if (growth > 50) {
    return { status: 'fail', summary: `نمو الذاكرة ${growth.toFixed(1)}%` };
  }
  return { status: 'pass', summary: `نمو الذاكرة ${growth.toFixed(1)}%` };
});

// ─────────────────────────────────────────────────────────────
//  Report
// ─────────────────────────────────────────────────────────────

const pass = results.filter((r) => r.status === 'pass').length;
const warn = results.filter((r) => r.status === 'warn').length;
const fail = results.filter((r) => r.status === 'fail').length;

console.log('');
console.log('═'.repeat(72));
console.log('  محاكي اكتشاف الأخطاء — البلوت');
console.log('═'.repeat(72));
console.log(`  الهدف: ${URL}`);
console.log(`  النتائج: ✅ ${pass} نجح · ⚠️  ${warn} تحذير · ❌ ${fail} فشل`);
console.log('═'.repeat(72));
for (const r of results) {
  const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️ ' : '❌';
  console.log(`  ${icon} ${r.id}  ${r.title}`);
  console.log(`       → ${r.summary}`);
  for (const ev of r.evidence.slice(0, 3)) console.log(`       · ${ev.slice(0, 90)}`);
}
console.log('═'.repeat(72));

const report = {
  timestamp: new Date().toISOString(),
  base: URL,
  totals: { pass, warn, fail, total: results.length },
  results,
  diagnostics: {
    consoleErrors: consoleLog.filter((c) => c.type === 'error').slice(0, 20),
    pageErrors: pageErrors.map((e) => e.message).slice(0, 20),
    requestFailures: requestFailures.slice(0, 20),
  },
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = join(OUT, `baloot-${stamp}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`  📄 التقرير: ${reportPath}`);
console.log('═'.repeat(72));

process.exit(fail > 0 ? 1 : 0);
