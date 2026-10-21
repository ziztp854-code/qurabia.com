/** Bounded real NextAuth -> production HTTP routes -> isolated PostgreSQL churn.
 * This process has no media SDK. HTTP session recovery is not WebRTC reconnect.
 * Run with node --import tsx after the loopback load-api-server is ready.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { hashPassword } from '../../apps/web/src/lib/auth/password.ts';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { request } = require('@playwright/test');
const { createPrismaClient } = require('@tahaddi/database');
const databaseUrl = process.env.VOICE_TEST_DATABASE_URL;
const target = new URL(databaseUrl || 'http://invalid');
if (
  process.env.VOICE_LOAD_RUN !== '1' ||
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
  !/^\/voice_test_load_approval_[a-zA-Z0-9_]+$/.test(target.pathname) ||
  target.search ||
  target.hash
)
  throw new Error('Refusing load outside the dedicated loopback approval database.');
const baseURL = 'http://127.0.0.1:3117';
const actorsCount = Number(process.env.VOICE_LOAD_ACTORS || 4);
const cycles = Number(process.env.VOICE_LOAD_CYCLES || 5);
assert(Number.isInteger(actorsCount) && actorsCount >= 2 && actorsCount <= 8);
assert(Number.isInteger(cycles) && cycles >= 1 && cycles <= 5);
const output = process.argv[2];
if (!output) throw new Error('Provide an output JSON path.');
const db = createPrismaClient(databaseUrl);
const ownedUsers = [],
  ownedRooms = [],
  contexts = new Set();
const samples = [],
  errors = [],
  checkpoints = [];
const checks = {
  real_credentials_sessions: false,
  no_duplicate_members: true,
  each_leave_returns_membership_to_host: true,
  database_matches_api: true,
  exact_owned_cleanup: false,
};
const password = `LocalVoiceLoad42!${randomUUID()}`;
let started = 0,
  deadline = Infinity;
const result = {
  scope:
    'Real NextAuth credentials, production room HTTP handlers and real isolated PostgreSQL. Media deliberately unconfigured; no SFU, capture, audible speech or physical devices are measured by this script.',
  physicalDevicesTested: false,
  mediaTested: false,
  clientDeadlineMs: 45_000,
  workload: {
    actors: actorsCount,
    host: 1,
    cycles,
    parallelRequestsPerWave: actorsCount,
    phases: ['join', 'fresh-http-context-recovery', 'idempotent-rejoin', 'leave'],
  },
  checks,
  samples,
  errors,
  checkpoints,
};
function timeout() {
  return Math.max(1, Math.min(45_000, deadline - performance.now()));
}
async function body(response) {
  response = await response;
  if (!response.ok())
    throw Object.assign(new Error('Unexpected HTTP status'), { status: response.status() });
  assert.match(response.headers()['cache-control'] || '', /no-store/);
  return response.json();
}
async function measure(phase, actor, work) {
  const at = performance.now();
  if (at > deadline) throw new Error('Bounded workload deadline exceeded.');
  try {
    const value = await work();
    samples.push({ phase, actor, ok: true, durationMs: performance.now() - at });
    return value;
  } catch (error) {
    const record = {
      phase,
      actor,
      ok: false,
      durationMs: performance.now() - at,
      status: Number.isInteger(error.status) ? error.status : null,
      error: error.name || 'Error',
    };
    samples.push(record);
    errors.push(record);
    throw error;
  }
}
async function newContext(storageState) {
  const context = await request.newContext({ baseURL, storageState, timeout: 45_000 });
  contexts.add(context);
  return context;
}
function post(actor, pathname, data) {
  return actor.api.post(pathname, { data, headers: { Origin: baseURL }, timeout: timeout() });
}
function postResponse(who, pathname) {
  return post(who, pathname, {});
}
async function actor(index, passwordHash) {
  const id = `voice_load_${randomUUID()}`;
  const email = `${id}@example.test`;
  ownedUsers.push(id);
  await db.user.create({
    data: { id, email, name: 'عضو تحميل محلي', passwordHash, role: 'USER', status: 'ACTIVE' },
  });
  const api = await newContext();
  const csrf = await (await api.get('/api/auth/csrf')).json();
  assert.equal(typeof csrf.csrfToken, 'string');
  const login = await api.post('/api/auth/callback/credentials', {
    form: { csrfToken: csrf.csrfToken, email, password, json: 'true', callbackUrl: '/voice' },
  });
  assert(login.ok());
  const session = await (await api.get('/api/auth/session')).json();
  assert.equal(session.user?.id, id);
  return { id, label: `actor-${index}`, api };
}
function validateMembers(snapshot, expectedIds) {
  const ids = snapshot.participants.map((person) => person.id);
  checks.no_duplicate_members &&= ids.length === new Set(ids).size;
  assert(checks.no_duplicate_members);
  assert.deepEqual([...ids].sort(), [...expectedIds].sort());
  assert.equal(snapshot.room.participantCount, expectedIds.length);
}
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
let roomId;
try {
  const passwordHash = await hashPassword(password);
  const host = await actor('host', passwordHash);
  const actors = [];
  // Account/session setup is sequential and excluded from request wave timing.
  for (let index = 0; index < actorsCount; index++) actors.push(await actor(index, passwordHash));
  checks.real_credentials_sessions = true;
  const created = await body(
    await post(host, '/api/voice/rooms', {
      name: 'حمل اعتماد محلي',
      description: 'بيانات معزولة للاختبار فقط',
      category: 'مجالس',
      cover: '/voice/covers/friends.webp',
      seatCount: 8,
      isPrivate: false,
      allowMicRequests: true,
      chatEnabled: true,
      moderatorsCanManage: true,
    }),
  );
  roomId = created.room.id;
  ownedRooms.push(roomId);
  const roomPath = `/api/voice/rooms/${roomId}`;
  await body(await post(host, `${roomPath}/join`, {}));
  // Warm the real route modules before measuring contention waves.
  await body(await post(actors[0], `${roomPath}/join`, {}));
  await body(await post(actors[0], `${roomPath}/leave`, {}));
  validateMembers(await body(await host.api.get(roomPath)), [host.id]);
  started = performance.now();
  deadline = started + 180_000;
  for (let cycle = 0; cycle < cycles; cycle++) {
    await Promise.all(
      actors.map((who) =>
        measure('join', who.label, () => body(postResponse(who, `${roomPath}/join`))),
      ),
    );
    const joined = await body(await host.api.get(roomPath, { timeout: timeout() }));
    validateMembers(joined, [host.id, ...actors.map((who) => who.id)]);
    await Promise.all(
      actors.map((who) =>
        measure('session-recovery', who.label, async () => {
          const previous = who.api;
          who.api = await newContext(await previous.storageState());
          await previous.dispose();
          contexts.delete(previous);
          const recovered = await body(await who.api.get(roomPath, { timeout: timeout() }));
          assert.equal(recovered.me?.id, who.id);
        }),
      ),
    );
    await Promise.all(
      actors.map((who) =>
        measure('rejoin', who.label, () => body(postResponse(who, `${roomPath}/join`))),
      ),
    );
    validateMembers(await body(await host.api.get(roomPath, { timeout: timeout() })), [
      host.id,
      ...actors.map((who) => who.id),
    ]);
    await Promise.all(
      actors.map((who) =>
        measure('leave', who.label, () => body(postResponse(who, `${roomPath}/leave`))),
      ),
    );
    const left = await body(await host.api.get(roomPath, { timeout: timeout() }));
    validateMembers(left, [host.id]);
    const record = await db.voiceRoom.findUnique({
      where: { id: roomId },
      select: { state: true },
    });
    const ids = record.state.participants.map((person) => person.id);
    checks.database_matches_api &&= ids.length === 1 && ids[0] === host.id;
    assert(checks.database_matches_api);
    checkpoints.push({
      cycle: cycle + 1,
      participantCount: left.participants.length,
      expectedParticipantCount: 1,
      persistedParticipantCount: ids.length,
      noDuplicates: true,
    });
  }
  result.durationMs = performance.now() - started;
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.failure = {
    name: error.name || 'Error',
    status: Number.isInteger(error.status) ? error.status : null,
    message:
      error.code ||
      'Load assertion or request failed; inspect local server log without credentials.',
  };
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  try {
    for (const id of ownedRooms) {
      await db.voiceReport.deleteMany({ where: { roomId: id } });
      await db.voiceRoom.deleteMany({ where: { id } });
    }
    await db.voicePreference.deleteMany({ where: { userId: { in: ownedUsers } } });
    await db.user.deleteMany({ where: { id: { in: ownedUsers } } });
    checks.exact_owned_cleanup =
      (await db.user.count({ where: { id: { in: ownedUsers } } })) === 0 &&
      (await db.voiceRoom.count({ where: { id: { in: ownedRooms } } })) === 0;
  } catch (error) {
    cleanupErrors.push(error.name || 'Error');
  }
  await Promise.all(
    [...contexts].map((context) =>
      context.dispose().catch(() => cleanupErrors.push('HTTPContextDisposeError')),
    ),
  );
  await db.$disconnect();
  result.cleanupErrors = cleanupErrors;
  result.summary = Object.fromEntries(
    [...new Set(samples.map((sample) => sample.phase))].map((phase) => {
      const group = samples.filter((sample) => sample.phase === phase);
      const times = group.map((sample) => sample.durationMs);
      return [
        phase,
        {
          requests: group.length,
          errors: group.filter((sample) => !sample.ok).length,
          p50Ms: percentile(times, 0.5),
          p95Ms: percentile(times, 0.95),
          maxMs: times.length ? Math.max(...times) : null,
        },
      ];
    }),
  );
  if (!checks.exact_owned_cleanup || cleanupErrors.length) {
    result.passed = false;
    process.exitCode = 1;
  }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        passed: result.passed,
        requests: samples.length,
        errors: errors.length,
        cleanup: checks.exact_owned_cleanup,
        summary: result.summary,
      },
      null,
      2,
    ),
  );
}
