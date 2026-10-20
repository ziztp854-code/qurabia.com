/** HTTP-only verification of the real local NextAuth -> DB -> gateway -> SFU path. */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { createPrismaClient } from '@tahaddi/database';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const databaseUrl = process.env.VOICE_TEST_DATABASE_URL;
  if (!databaseUrl) throw Error('Set isolated VOICE_TEST_DATABASE_URL');
  const dbUrl = new URL(databaseUrl);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(dbUrl.hostname) ||
    dbUrl.pathname !== '/voice_test_review'
  )
    throw Error('This smoke test only supports isolated local voice_test_review');
  const app = 'http://127.0.0.1:3000',
    gateway = 'http://127.0.0.1:7890';
  const db = createPrismaClient(databaseUrl),
    ids: string[] = [],
    clients: APIRequestContext[] = [];
  const password = 'LocalVoiceAa42!' + randomUUID(),
    passwordHash = await hashPassword(password);
  async function body(r: APIResponse) {
    if (!r.ok()) throw Error(`Unexpected HTTP ${r.status()}`);
    return r.json();
  }
  async function actor() {
    const id = 'voice_stack_' + randomUUID(),
      email = id + '@example.test';
    ids.push(id);
    await db.user.create({
      data: { id, email, name: 'حساب اختبار محلي', passwordHash, role: 'USER', status: 'ACTIVE' },
    });
    const api = await request.newContext({ baseURL: app });
    clients.push(api);
    const { csrfToken } = await body(await api.get('/api/auth/csrf'));
    await api.post('/api/auth/callback/credentials', {
      form: { csrfToken, email, password, json: 'true', callbackUrl: '/voice' },
    });
    assert.equal((await body(await api.get('/api/auth/session'))).user.id, id);
    return { id, api };
  }
  function post(a: Awaited<ReturnType<typeof actor>>, path: string, data: unknown) {
    return a.api.post(path, { headers: { Origin: app }, data });
  }
  const checks: Record<string, boolean> = {};
  try {
    const host = await actor(),
      guest = await actor();
    const created = await body(
      await post(host, '/api/voice/rooms', {
        name: 'اختبار خدمات محلي',
        description: 'بيانات اختبار مؤقتة وليست إنتاجية',
        category: 'مجالس',
        cover: '/voice/covers/friends.webp',
        seatCount: 4,
        isPrivate: false,
        allowMicRequests: true,
        chatEnabled: true,
        moderatorsCanManage: true,
      }),
    );
    const id = created.room.id;
    await body(await post(host, `/api/voice/rooms/${id}/join`, {}));
    await body(await post(guest, `/api/voice/rooms/${id}/join`, {}));
    await body(
      await post(guest, `/api/voice/rooms/${id}/events`, { type: 'request-seat', seatIndex: 1 }),
    );
    await body(
      await post(host, `/api/voice/rooms/${id}/events`, {
        type: 'approve-seat',
        userId: guest.id,
        seatIndex: 1,
      }),
    );
    const grant = await body(await post(guest, `/api/voice/rooms/${id}/token`, {}));
    const claims = JSON.parse(Buffer.from(grant.token.split('.')[1], 'base64url').toString());
    assert.equal(claims.video.canPublish, true);
    assert.equal(JSON.parse(claims.metadata).voiceSessionVersion, 0);
    checks.authenticated_current_speaker_token = true;
    const first = await fetch(
      gateway + '/rtc/validate?access_token=' + encodeURIComponent(grant.token),
    );
    assert.equal(first.status, 200);
    checks.real_gateway_and_sfu_validation = true;
    await body(
      await post(host, `/api/voice/rooms/${id}/events`, {
        type: 'role',
        userId: guest.id,
        role: 'listener',
      }),
    );
    const downgraded = await body(
      await guest.api.post('/api/voice/admit/', {
        headers: { Authorization: 'Bearer ' + grant.token },
        data: {},
      }),
    );
    const updated = JSON.parse(Buffer.from(downgraded.token.split('.')[1], 'base64url').toString());
    assert.equal(updated.video.canPublish, false);
    checks.old_speaker_token_downgraded_from_real_db = true;
    await body(
      await post(host, `/api/voice/rooms/${id}/events`, { type: 'remove', userId: guest.id }),
    );
    assert.equal(
      (await fetch(gateway + '/rtc/validate?access_token=' + encodeURIComponent(grant.token)))
        .status,
      403,
    );
    checks.old_removed_token_denied_at_real_gateway = true;
    await db.user.update({ where: { id: guest.id }, data: { tokenVersion: { increment: 1 } } });
    assert.equal(
      (
        await guest.api.post('/api/voice/admit/', {
          headers: { Authorization: 'Bearer ' + grant.token },
          data: {},
        })
      ).status(),
      401,
    );
    checks.revoked_session_denied_by_real_app = true;
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
    await fs.mkdir('/workspace/shared/downloads/tahaddi-live-platform-review', { recursive: true });
    await fs.writeFile(
      '/workspace/shared/downloads/tahaddi-live-platform-review/authenticated-local-stack.json',
      JSON.stringify(
        {
          passed: true,
          scope:
            'Real local NextAuth credentials sessions, isolated PostgreSQL, application admission, gateway and SFU validation endpoint; no browser or audio capture in this check',
          checks,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await Promise.all(clients.map((c) => c.dispose()));
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local stack check failed');
  process.exitCode = 1;
});
