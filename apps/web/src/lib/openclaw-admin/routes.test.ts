import { beforeEach, describe, expect, it, vi } from 'vitest';
const d = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  question: vi.fn(),
  mutate: vi.fn(),
  proposal: vi.fn(),
  list: vi.fn(),
  audit: vi.fn(),
  claim: vi.fn(),
  rate: vi.fn(),
  tx: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: d.session,
  isSessionUserCurrent: (
    s: { id: string; tokenVersion: number },
    u: { id: string; status: string; tokenVersion: number } | null,
  ) => u?.id === s.id && u.status === 'ACTIVE' && u.tokenVersion === s.tokenVersion,
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => db }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: d.rate }));
const db = {
  user: { findUnique: d.user },
  question: { count: d.count, groupBy: d.groupBy, findUnique: d.question, updateMany: d.mutate },
  auditLog: { findUnique: d.proposal, findMany: d.list, create: d.audit, updateMany: d.claim },
  $transaction: d.tx,
};
import { POST as tool } from '../../app/api/integrations/openclaw/route';
import { GET, POST as decide } from '../../app/api/admin/openclaw/route';
const secret = Buffer.alloc(48, 120).toString('ascii');
const uuid = '550e8400-e29b-41d4-a716-446655440000';
const id = `ocp_${uuid}`;
const owner = { id: 'owner1', role: 'OWNER', status: 'ACTIVE', tokenVersion: 1 };
const change = {
  tool: 'propose_question_status',
  args: { requestId: uuid, questionId: 'q1', nextStatus: 'ARCHIVED', reason: 'مراجعة' },
};
function proposal() {
  return {
    id,
    action: 'openclaw.question_status.proposal',
    resourceId: 'q1',
    result: 'PENDING',
    requestId: uuid,
    createdAt: new Date(),
    before: {
      status: 'PUBLISHED',
      version: 3,
      lastEditedAt: '2026-01-01T00:00:00.000Z',
      prompt: 'سؤال',
    },
    after: { status: 'ARCHIVED', reason: 'مراجعة' },
  };
}
function req(body: unknown, human = false, extra: Record<string, string> = {}) {
  return new Request(`https://qurabia.com/api/${human ? 'admin' : 'integrations'}/openclaw`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(human ? { origin: 'https://qurabia.com' } : { authorization: `Bearer ${secret}` }),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
const approve = () => decide(req({ id, decision: 'approve' }, true));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('QURABIA_OPENCLAW_ENABLED', 'true');
  vi.stubEnv('QURABIA_OPENCLAW_SERVICE_TOKEN', secret);
  d.rate.mockResolvedValue(true);
  d.session.mockResolvedValue({ user: owner });
  d.user.mockResolvedValue(owner);
  d.tx.mockImplementation(async (callback) => callback(db));
  d.proposal.mockResolvedValue(proposal());
  d.claim.mockResolvedValue({ count: 1 });
  d.mutate.mockResolvedValue({ count: 1 });
  d.audit.mockResolvedValue({});
});
describe('service restricted permissions', () => {
  it('returns aggregate counts', async () => {
    d.groupBy.mockResolvedValue([{ status: 'DRAFT', _count: { _all: 12 } }]);
    expect(await (await tool(req({ tool: 'question_stats', args: {} }))).json()).toEqual({
      ok: true,
      data: { counts: [{ status: 'DRAFT', count: 12 }] },
    });
  });
  it.each(['delete_question', 'publish', 'approve', 'execute', 'shell'])(
    'cannot invoke %s',
    async (name) => {
      expect((await tool(req({ tool: name, args: {} }))).status).toBe(400);
      expect(d.tx).not.toHaveBeenCalled();
    },
  );
  it('rejects publication and arbitrary URL arguments', async () => {
    expect(
      (await tool(req({ ...change, args: { ...change.args, nextStatus: 'PUBLISHED' } }))).status,
    ).toBe(400);
    expect(
      (await tool(req({ tool: 'site_status', args: { url: 'http://internal' } }))).status,
    ).toBe(400);
  });
  it('creates a pending proposal without modifying a question', async () => {
    d.proposal.mockResolvedValue(null);
    d.question.mockResolvedValue({
      id: 'q1',
      status: 'PUBLISHED',
      version: 3,
      lastEditedAt: new Date('2026-01-01'),
      prompt: 'سؤال',
      _count: { quizzes: 0 },
    });
    expect(await (await tool(req(change))).json()).toEqual({
      ok: true,
      data: { id, result: 'PENDING', requiresApproval: true },
    });
    expect(d.mutate).not.toHaveBeenCalled();
  });
  it('rejects linked quiz questions', async () => {
    d.proposal.mockResolvedValue(null);
    d.question.mockResolvedValue({ id: 'q1', _count: { quizzes: 1 } });
    expect((await tool(req(change))).status).toBe(409);
    expect(d.audit).not.toHaveBeenCalled();
  });
  it('makes exact repeated proposal requests idempotent', async () => {
    expect((await tool(req(change))).status).toBe(200);
    expect(d.audit).not.toHaveBeenCalled();
    expect(
      (await tool(req({ ...change, args: { ...change.args, questionId: 'q2' } }))).status,
    ).toBe(409);
  });
  it('fails closed for disabled, unauthorized, oversized or rate-limited calls', async () => {
    vi.stubEnv('QURABIA_OPENCLAW_ENABLED', 'false');
    expect((await tool(req(change))).status).toBe(503);
    vi.stubEnv('QURABIA_OPENCLAW_ENABLED', 'true');
    expect((await tool(req(change, false, { authorization: 'Bearer wrong' }))).status).toBe(401);
    expect((await tool(req({ padding: 'x'.repeat(5000) }))).status).toBe(413);
    d.rate.mockResolvedValue(false);
    expect((await tool(req(change))).status).toBe(429);
  });
});
describe('explicit human approval', () => {
  it('rejects service authorization and foreign origins', async () => {
    expect(
      (await decide(req({ id, decision: 'approve' }, true, { authorization: `Bearer ${secret}` })))
        .status,
    ).toBe(403);
    expect(
      (await decide(req({ id, decision: 'approve' }, true, { origin: 'https://evil.test' })))
        .status,
    ).toBe(403);
    expect(d.tx).not.toHaveBeenCalled();
  });
  it('rejects missing and revoked sessions and non-owner roles', async () => {
    d.session.mockResolvedValue(null);
    expect((await approve()).status).toBe(401);
    d.session.mockResolvedValue({ user: { ...owner, tokenVersion: 0 } });
    expect((await approve()).status).toBe(401);
    d.session.mockResolvedValue({ user: owner });
    d.user.mockResolvedValue({ ...owner, role: 'ADMIN' });
    expect((await approve()).status).toBe(403);
  });
  it('rechecks owner permission in the transaction', async () => {
    d.user.mockResolvedValueOnce(owner).mockResolvedValueOnce({ ...owner, role: 'USER' });
    expect((await approve()).status).toBe(403);
    expect(d.mutate).not.toHaveBeenCalled();
  });
  it('rejects expired, replayed, concurrent or changed snapshots', async () => {
    d.proposal.mockResolvedValue({ ...proposal(), createdAt: new Date(Date.now() - 16 * 60_000) });
    expect((await approve()).status).toBe(409);
    d.proposal.mockResolvedValue({ ...proposal(), result: 'EXECUTED' });
    expect((await approve()).status).toBe(409);
    d.proposal.mockResolvedValue(proposal());
    d.claim.mockResolvedValue({ count: 0 });
    expect((await approve()).status).toBe(409);
    d.claim.mockResolvedValue({ count: 1 });
    d.mutate.mockResolvedValue({ count: 0 });
    expect((await approve()).status).toBe(409);
  });
  it('executes only approved exact state and audits real owner atomically', async () => {
    expect((await approve()).status).toBe(200);
    expect(d.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'q1',
          status: 'PUBLISHED',
          version: 3,
          quizzes: { none: {} },
        }),
        data: expect.objectContaining({ status: 'ARCHIVED', version: { increment: 1 } }),
      }),
    );
    expect(d.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'owner1',
          actorRole: 'OWNER',
          result: 'EXECUTED',
        }),
      }),
    );
    expect(d.tx).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('rejects without mutation and shows bounded owner list', async () => {
    expect((await decide(req({ id, decision: 'reject' }, true))).status).toBe(200);
    expect(d.mutate).not.toHaveBeenCalled();
    d.list.mockResolvedValue([proposal()]);
    expect(
      (await (await GET(new Request('https://qurabia.com/api/admin/openclaw'))).json()).proposals,
    ).toHaveLength(1);
    expect(d.list).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });
  it('sanitizes database failures', async () => {
    d.proposal.mockRejectedValue(new Error('postgres://password-secret'));
    const response = await approve();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('password-secret');
  });
});
