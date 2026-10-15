import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { assertEnabled, OpenClawError, type ToolRequest } from './protocol';

type Database = ReturnType<typeof getPrismaClient>;
type Transaction = Prisma.TransactionClient;
const action = 'openclaw.question_status.proposal';
const identitySelect = { id: true, role: true, status: true, tokenVersion: true } as const;
const snapshotSchema = z
  .object({
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    version: z.number().int(),
    lastEditedAt: z.string().datetime(),
    prompt: z.string(),
  })
  .strict();
const changeSchema = z
  .object({ status: z.enum(['DRAFT', 'ARCHIVED']), reason: z.string().max(500) })
  .strict();

export async function requireOwner(request: Request) {
  assertEnabled();
  if (request.headers.has('authorization')) throw new OpenClawError(403, 'يلزم اعتماد بشري.');
  const session = await getCurrentSession();
  if (!session?.user?.id) throw new OpenClawError(401, 'يلزم تسجيل الدخول.');
  await assertOwner(getPrismaClient(), session.user);
  if (!(await checkRateLimit(`openclaw-owner:${session.user.id}`, 30, 60_000)))
    throw new OpenClawError(429, 'تجاوزت حد الطلبات.');
  return session.user;
}
async function assertOwner(
  db: Pick<Transaction, 'user'>,
  user: { id: string; tokenVersion: number },
) {
  const stored = await db.user.findUnique({ where: { id: user.id }, select: identitySelect });
  if (!isSessionUserCurrent(user, stored)) throw new OpenClawError(401, 'الجلسة غير صالحة.');
  if (stored.role !== 'OWNER') throw new OpenClawError(403, 'هذه العملية للمالك فقط.');
}
export function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new OpenClawError(403, 'مصدر الطلب غير مصرح.');
}
export async function dispatchTool(input: ToolRequest) {
  const db = getPrismaClient();
  if (input.tool === 'site_status') {
    await db.question.count({ where: { id: '__openclaw_health_probe__' } });
    return {
      site: 'qurabia',
      status: 'ok',
      database: 'reachable',
      capabilities: ['site_status', 'question_stats', 'propose_question_status'],
    };
  }
  if (input.tool === 'question_stats') {
    const counts = await db.question.groupBy({ by: ['status'], _count: { _all: true } });
    return { counts: counts.map((row) => ({ status: row.status, count: row._count._all })) };
  }
  return propose(db, input.args);
}
async function propose(
  db: Database,
  args: Extract<ToolRequest, { tool: 'propose_question_status' }>['args'],
) {
  const id = `ocp_${args.requestId.toLowerCase()}`;
  return db.$transaction(
    async (tx) => {
      const prior = await tx.auditLog.findUnique({ where: { id } });
      if (prior) {
        const change = changeSchema.safeParse(prior.after);
        if (
          prior.action !== action ||
          prior.resourceId !== args.questionId ||
          !change.success ||
          change.data.status !== args.nextStatus ||
          change.data.reason !== args.reason
        )
          throw new OpenClawError(409, 'معرّف الطلب مستخدم لعملية أخرى.');
        return { id, result: prior.result, requiresApproval: prior.result === 'PENDING' };
      }
      const question = await tx.question.findUnique({
        where: { id: args.questionId },
        select: {
          id: true,
          status: true,
          version: true,
          lastEditedAt: true,
          prompt: true,
          _count: { select: { quizzes: true } },
        },
      });
      if (!question) throw new OpenClawError(404, 'السؤال غير موجود.');
      if (question._count.quizzes > 0) throw new OpenClawError(409, 'السؤال مرتبط بمسابقة.');
      if (question.status === args.nextStatus)
        throw new OpenClawError(409, 'حالة السؤال مطابقة للطلب.');
      await tx.auditLog.create({
        data: {
          id,
          actorRole: 'USER',
          action,
          resourceType: 'Question',
          resourceId: question.id,
          result: 'PENDING',
          reasonCode: 'HUMAN_APPROVAL_REQUIRED',
          requestId: args.requestId,
          before: {
            status: question.status,
            version: question.version,
            lastEditedAt: question.lastEditedAt.toISOString(),
            prompt: question.prompt,
          },
          after: { status: args.nextStatus, reason: args.reason },
        },
      });
      return { id, result: 'PENDING', requiresApproval: true };
    },
    { isolationLevel: 'Serializable' },
  );
}
export async function listProposals() {
  return getPrismaClient().auditLog.findMany({
    where: { action },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      resourceId: true,
      result: true,
      createdAt: true,
      before: true,
      after: true,
    },
  });
}
export async function decideProposal(
  input: { id: string; decision: 'approve' | 'reject' },
  actor: { id: string; tokenVersion: number },
) {
  return getPrismaClient().$transaction(
    async (tx) => {
      await assertOwner(tx, actor);
      const proposal = await tx.auditLog.findUnique({ where: { id: input.id } });
      if (!proposal || proposal.action !== action) throw new OpenClawError(404, 'الطلب غير موجود.');
      if (proposal.result !== 'PENDING') throw new OpenClawError(409, 'سبق البت في الطلب.');
      const now = new Date();
      if (now.getTime() - proposal.createdAt.getTime() > 15 * 60_000 || proposal.createdAt > now)
        throw new OpenClawError(409, 'انتهت صلاحية الطلب. اطلب مقترحًا جديدًا.');
      const before = snapshotSchema.parse(proposal.before);
      const after = changeSchema.parse(proposal.after);
      const result = input.decision === 'approve' ? 'EXECUTED' : 'REJECTED';
      const claimed = await tx.auditLog.updateMany({
        where: { id: proposal.id, result: 'PENDING' },
        data: { result },
      });
      if (claimed.count !== 1) throw new OpenClawError(409, 'سبق البت في الطلب.');
      if (input.decision === 'approve') {
        const updated = await tx.question.updateMany({
          where: {
            id: proposal.resourceId ?? '',
            status: before.status,
            version: before.version,
            lastEditedAt: new Date(before.lastEditedAt),
            prompt: before.prompt,
            quizzes: { none: {} },
          },
          data: {
            status: after.status,
            version: { increment: 1 },
            lastEditedAt: now,
            archivedAt: after.status === 'ARCHIVED' ? now : null,
          },
        });
        if (updated.count !== 1)
          throw new OpenClawError(409, 'تغير السؤال أو أصبح مرتبطًا بمسابقة. اطلب مقترحًا جديدًا.');
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: 'OWNER',
          action: `openclaw.question_status.${input.decision}`,
          resourceType: 'Question',
          resourceId: proposal.resourceId,
          requestId: proposal.requestId,
          result,
          reasonCode: 'EXPLICIT_OWNER_DECISION',
          before: proposal.before ?? {},
          after: { proposalId: proposal.id, status: after.status, reason: after.reason },
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}
