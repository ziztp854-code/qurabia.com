#!/usr/bin/env node
/**
 * Wrapper حول `prisma migrate deploy` يجعله آمناً في البيئة المحلية
 * وفي CI.
 *
 * السبب الجذري: pre-push hook يشغّل `turbo build` لكل الحزم، وCI يشغّل
 * `db:migrate:deploy` على قاعدة الاختبار. لكن محلياً قد لا تتوفر قاعدة بيانات قابلة للوصول
 * (مثلاً: Docker ليس مشغّلاً، أو الـ URL يشير إلى `localhost` بدون خدمة).
 * بدلاً من إيقاف الـ hook بصمت أو كسره، نُجرب اختبار اتصال TCP بسيط
 * ونُعلم المستخدم بحالة التخطّي.
 *
 * السلوك:
 *  - غياب `DATABASE_URL`            → طباعة تنبيه والخروج بصفر.
 *  - فشل اختبار اتصال TCP          → طباعة تنبيه والخروج بصفر.
 *  - نجاح الاتصال                   → تنفيذ `prisma migrate deploy` كالمعتاد.
 *  - داخل Vercel (VERCEL=1)         → تجاهل اختبار TCP وتنفيذ الأمر مباشرة.
 *  - Vercel preview/development     → تخطّي الهجرة ما لم يُضبط RUN_DB_MIGRATE=1،
 *                                     حتى لا تلمس بنية preview قاعدة الإنتاج.
 *
 * ترحيلات الإنتاج تُشغّل في Render قبل نشر خدمة الزمن الحقيقي.
 */

import { spawnSync } from 'node:child_process';
import net from 'node:net';

const url = process.env.DATABASE_URL?.trim();
const vercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

function logSkip(reason) {
  console.warn(
    `[db:migrate:deploy] تخطّي تنفيذ الـ migration: ${reason}.\n` +
      'تُطبّق ترحيلات الإنتاج في Render قبل نشر خدمة الزمن الحقيقي.',
  );
  process.exit(0);
}

if (process.env.SKIP_DB_MIGRATE === '1') {
  logSkip('SKIP_DB_MIGRATE=1 مضبوط في البيئة');
}

const vercelEnv = process.env.VERCEL_ENV;
if (vercel && vercelEnv && vercelEnv !== 'production' && process.env.RUN_DB_MIGRATE !== '1') {
  logSkip(`بناء Vercel من نوع ${vercelEnv} (اضبط RUN_DB_MIGRATE=1 للتجاوز)`);
}

if (!url) {
  logSkip('DATABASE_URL غير معرَّف');
}

if (!vercel) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    logSkip(`DATABASE_URL غير صالح: ${url}`);
  }

  const host = parsed.hostname || 'localhost';
  const port = Number.parseInt(parsed.port || '5432', 10);

  const reachable = await new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });

  if (!reachable) {
    logSkip(`قاعدة البيانات غير متاحة على ${host}:${port}`);
  }
}

const args = ['prisma', 'migrate', 'deploy', ...process.argv.slice(2)];
const result = spawnSync('pnpm', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
