// Synthetic accounts and loopback only; no production audio or credentials.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium, expect } = requireWeb('@playwright/test');
const origin = 'http://127.0.0.1:3400';
const { roomId } = JSON.parse(await readFile('/tmp/apple-design-pilot-fixture.json', 'utf8'));
const endpoint = `${origin}/api/voice/rooms/${roomId}`;
const output = path.join(root, 'docs/visual-evidence/apple-design-pilot');
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
let listenerContext;
try {
  async function login(email) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', (route) =>
      route.request().url().startsWith(origin) || /^(data:|blob:)/.test(route.request().url())
        ? route.continue()
        : route.abort(),
    );
    const csrfToken = (await (await context.request.get(`${origin}/api/auth/csrf`)).json())
      .csrfToken;
    await context.request.post(`${origin}/api/auth/callback/credentials`, {
      form: {
        csrfToken,
        email,
        password: 'Qurabia-QA-2026!',
        json: 'true',
        callbackUrl: `${origin}/profile`,
      },
    });
    return context;
  }
  const owner = await login('owner@example.test');
  listenerContext = await login('speaker@example.test');
  // Repeated local runs start from listener membership, without changing any account data.
  await listenerContext.request.post(`${endpoint}/leave`, { headers: { origin } });
  const join = await listenerContext.request.post(`${endpoint}/join`, {
    headers: { origin },
    data: {},
  });
  expect(join.status()).toBe(200);
  const initial = await join.json();
  expect(initial.me).toMatchObject({
    role: 'listener',
    seatIndex: null,
    muted: true,
    requestedSeat: null,
  });
  const rejected = await listenerContext.request.post(`${endpoint}/events`, {
    headers: { origin },
    data: { type: 'give-mic', userId: initial.room.hostId },
  });
  expect(rejected.status()).toBe(403);
  const page = await owner.newPage();
  await page.goto(`${origin}/voice/${roomId}`);
  await page.getByRole('button', { name: /عرض أعضاء الغرفة/ }).click();
  const members = page.getByRole('region', { name: 'أعضاء الغرفة' });
  await members.getByRole('button', { name: new RegExp(initial.me.name) }).click();
  const grant = page.getByRole('button', { name: 'إعطاء المايك', exact: true });
  await expect(grant).toBeEnabled();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await grant.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `after-give-mic-${width}.png`) });
  }
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().replace(/\/$/, '') === `${endpoint}/events` &&
      response.status() !== 308 &&
      response.request().method() === 'POST' &&
      response.request().postDataJSON()?.type === 'give-mic',
  );
  await grant.click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const granted = await response.json();
  const promoted = granted.participants.find((participant) => participant.id === initial.me.id);
  expect(promoted).toMatchObject({
    role: 'speaker',
    muted: true,
    requestedSeat: null,
    handRaised: false,
  });
  expect(promoted.seatIndex).not.toBeNull();
  expect(granted.room.lockedSeats).not.toContain(promoted.seatIndex);
  await expect(grant).toHaveCount(0);
  const listenerSnapshot = await listenerContext.request.get(endpoint);
  expect(listenerSnapshot.status()).toBe(200);
  const observed = (await listenerSnapshot.json()).me;
  expect(observed).toMatchObject({ role: 'speaker', seatIndex: promoted.seatIndex, muted: true });
  await writeFile(
    path.join(output, 'give-mic-check.json'),
    JSON.stringify(
      {
        environment: 'local synthetic database, no LiveKit configured',
        unauthorizedStatus: rejected.status(),
        grantStatus: response.status(),
        initiallyRequested: initial.me.requestedSeat,
        role: observed.role,
        seatIndex: observed.seatIndex,
        muted: observed.muted,
        mediaSyncPending: granted.mediaSyncPending ?? false,
        realAudioVerified: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Local give-mic browser/API checks passed; listener remains muted.');
} finally {
  if (listenerContext)
    await listenerContext.request
      .post(`${endpoint}/leave`, { headers: { origin } })
      .catch(() => {});
  await browser.close();
}
