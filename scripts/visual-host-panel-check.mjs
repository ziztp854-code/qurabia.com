import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const TARGET_URL = 'http://localhost:3000/host?sessionId=cmtiq0gms0001gsctaq3pcmlc';
const SIGNIN_URL = 'http://localhost:3000/auth/sign-in';
const OUT_DIR = 'c:/Projects/qurabia/checkpoints/visual-host-panel';
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
// Read host credentials from environment variables to keep secrets out of
// version control. Run with:
//   HOST_CHECK_EMAIL=... HOST_CHECK_PASSWORD=... \
//     node scripts/visual-host-panel-check.mjs
const checkEmail = process.env.HOST_CHECK_EMAIL;
const checkPassword = process.env.HOST_CHECK_PASSWORD;
if (!checkEmail || !checkPassword) {
  console.error(
    'Set HOST_CHECK_EMAIL and HOST_CHECK_PASSWORD env vars before running.',
  );
  process.exit(1);
}
const CREDENTIALS = { email: checkEmail, password: checkPassword };
const VIEWPORTS = [
  { label: 'desktop-1920x1080', width: 1920, height: 1080 },
  { label: 'laptop-1440x900', width: 1440, height: 900 },
  { label: 'tablet-landscape-1024x768', width: 1024, height: 768 },
  { label: 'tablet-portrait-768x1024', width: 768, height: 1024 },
  { label: 'mobile-390x844', width: 390, height: 844 },
];

function findChrome() {
  for (const path of CHROME_PATHS) {
    if (existsSync(path)) return path;
  }
  return null;
}

async function signIn(page) {
  console.log('[auth] navigating to sign-in');
  await page.goto(SIGNIN_URL, { waitUntil: 'networkidle2', timeout: 45_000 });
  await page.waitForSelector('input[name="email"]', { timeout: 10_000 });
  await page.type('input[name="email"]', CREDENTIALS.email, { delay: 10 });
  await page.type('input[name="password"]', CREDENTIALS.password, { delay: 10 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log(`[auth] post-signin url=${page.url()}`);
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const executablePath = findChrome();
  if (!executablePath) {
    console.error('Chrome not found');
    process.exit(1);
  }
  console.log(`Using Chrome: ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await signIn(page);
      console.log(`[${viewport.label}] navigating to host panel`);
      await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 45_000 });
      await new Promise((r) => setTimeout(r, 4_000));
      const file = join(OUT_DIR, `host-panel-${viewport.label}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const meta = await page.evaluate(() => {
        const h1 = document.querySelector('h1')?.textContent?.trim() ?? '';
        const dt = Array.from(document.querySelectorAll('dt')).map((el) => el.textContent?.trim() ?? '');
        const dd = Array.from(document.querySelectorAll('dd')).map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '');
        const buttons = document.querySelectorAll('button').length;
        const inputs = document.querySelectorAll('input').length;
        return { h1, dt, dd, buttonCount: buttons, inputCount: inputs, url: location.href };
      });
      console.log(`[${viewport.label}] h1="${meta.h1}" buttons=${meta.buttonCount} inputs=${meta.inputCount}`);
      console.log(`         dt: ${JSON.stringify(meta.dt)}`);
      console.log(`         dd: ${JSON.stringify(meta.dd)}`);
      console.log(`[${viewport.label}] saved -> ${file}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
