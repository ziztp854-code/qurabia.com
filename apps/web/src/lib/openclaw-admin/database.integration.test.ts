import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
const context = vi.hoisted(() => ({
  database: undefined as ReturnType<typeof createPrismaClient> | undefined,
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => context.database }));
vi.mock('@/lib/auth/session', async () => ({
  getCurrentSession: async () => ({ user: { id: 'owner-test', tokenVersion: 1 } }),
  ...(await import('@/lib/auth/session-user')),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: async () => true }));
import { GET, POST as decide } from '../../app/api/admin/openclaw/route';
import { POST as tool } from '../../app/api/integrations/openclaw/route';

const databaseUrl = process.env.OPENCLAW_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const secret = Buffer.alloc(48, 120).toString('ascii');
const requestId = '550e8400-e29b-41d4-a716-446655440000';
const proposalId = `ocp_${requestId}`;
const url = 'http://127.0.0.1:3000/api/admin/openclaw';
function ownerRequest() {
  return new Request(url, {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:3000' },
    body: JSON.stringify({ id: proposalId, decision: 'approve' }),
  });
}
async function propose() {
  return tool(
    new Request('http://127.0.0.1:3000/api/integrations/openclaw', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        tool: 'propose_question_status',
        args: {
          requestId,
          questionId: 'question-test',
          nextStatus: 'ARCHIVED',
          reason: 'Disposable transaction test',
        },
      }),
    }),
  );
}

describe.skipIf(!enabled)('OpenClaw disposable PostgreSQL transaction boundary', () => {
  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/openclaw_approval_test'
    )
      throw new Error('Only the disposable loopback test database is permitted');
    context.database = createPrismaClient(databaseUrl!);
    const db = context.database;
    await db.$executeRawUnsafe(
      `CREATE TYPE "UserRole" AS ENUM ('USER','CONTENT_EDITOR','MODERATOR','ADMIN','OWNER')`,
    );
    await db.$executeRawUnsafe(
      `CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','PENDING','SUSPENDED','DELETED')`,
    );
    await db.$executeRawUnsafe(
      `CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT','PUBLISHED','ARCHIVED')`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE "User" (id text PRIMARY KEY, role "UserRole" NOT NULL, status "UserStatus" NOT NULL, "tokenVersion" integer NOT NULL)`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE "Question" (id text PRIMARY KEY, status "QuestionStatus" NOT NULL, version integer NOT NULL, "lastEditedAt" timestamp(3) NOT NULL, prompt text NOT NULL, "archivedAt" timestamp(3), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE "QuizQuestion" ("quizId" text NOT NULL, "questionId" text NOT NULL REFERENCES "Question"(id), PRIMARY KEY ("quizId","questionId"))`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE "AuditLog" (id text PRIMARY KEY, "actorId" text REFERENCES "User"(id), "actorRole" "UserRole" NOT NULL, action varchar(120) NOT NULL, "resourceType" varchar(80) NOT NULL, "resourceId" varchar(191), "targetUserId" text, result varchar(32) NOT NULL, "reasonCode" varchar(80), "requestId" varchar(191), before jsonb, after jsonb, "createdAt" timestamp(3) NOT NULL DEFAULT now())`,
    );
    vi.stubEnv('QURABIA_OPENCLAW_ENABLED', 'true');
    vi.stubEnv('QURABIA_OPENCLAW_SERVICE_TOKEN', secret);
  });
  beforeEach(async () => {
    const db = context.database!;
    await db.$executeRawUnsafe('TRUNCATE "AuditLog", "QuizQuestion", "Question", "User"');
    await db.$executeRawUnsafe(
      `INSERT INTO "User" (id,role,status,"tokenVersion") VALUES ('owner-test','OWNER','ACTIVE',1)`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "Question" (id,status,version,"lastEditedAt",prompt) VALUES ('question-test','PUBLISHED',1,now(),'Disposable question')`,
    );
    expect((await propose()).status).toBe(200);
  });
  afterAll(async () => {
    await context.database?.$disconnect();
    vi.unstubAllEnvs();
  });
  it('permits exactly one of two simultaneous owner approvals', async () => {
    const outcomes = await Promise.all([decide(ownerRequest()), decide(ownerRequest())]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
    const body = await (await GET(new Request(url))).json();
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].result).toBe('EXECUTED');
    expect(
      await context.database!.auditLog.count({
        where: { action: 'openclaw.question_status.approve' },
      }),
    ).toBe(1);
  });
  it('rolls back the pending claim when a reviewed question has changed', async () => {
    await context.database!.$executeRawUnsafe(
      `UPDATE "Question" SET version=2 WHERE id='question-test'`,
    );
    expect((await decide(ownerRequest())).status).toBe(409);
    const body = await (await GET(new Request(url))).json();
    expect(body.proposals[0].result).toBe('PENDING');
    expect(
      await context.database!.auditLog.count({
        where: { action: 'openclaw.question_status.approve' },
      }),
    ).toBe(0);
  });
});
