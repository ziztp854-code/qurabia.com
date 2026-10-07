import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { listManagedUsers } from './users';
import UsersPage from '@/app/admin/(console)/users/page';
import ContentPage from '@/app/admin/(console)/content/page';
import RoomsPage from '@/app/admin/(console)/rooms/page';
import AuditPage from '@/app/admin/(console)/audit/page';
import OverviewPage from '@/app/admin/(console)/page';
import {
  updateUserAccess, grantUserSubscription, cancelUserSubscriptionAction,
} from '@/app/admin/(console)/users/actions';
import { grantSubscription, cancelUserSubscription, getDisplayPlanCode } from '@/lib/subscription/entitlements';

const mocks = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() });
  return {
    role: 'OWNER', transactionRole: 'OWNER',
    getServerSession: vi.fn(), redirect: vi.fn(), verifyPassword: vi.fn(), rateLimit: vi.fn(),
    prisma: { user: model(), question: model(), quiz: model(), liveSession: model(), category: model(), auditLog: model(), userSubscription: model(), $transaction: vi.fn() },
  };
});
vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, unstable_rethrow: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => mocks.prisma, hasDatabaseUrl: () => true }));
vi.mock('@/lib/auth/password', () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock('@/lib/presence/audience', () => ({ getAudienceSnapshot: vi.fn(async () => null) }));
vi.mock('@/components/admin/question-bank-filters', () => ({ QuestionBankFilters: () => null }));

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ userId: 'fixture-target', role: 'USER', status: 'SUSPENDED', expectedTokenVersion: '2', currentPassword: 'fixture-password', planCode: 'KNIGHT', subscriptionId: 'fixture-sub' })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role = 'OWNER';
  mocks.transactionRole = 'OWNER';
  // A forged OWNER claim in the session must never override the database role.
  mocks.getServerSession.mockResolvedValue({ user: { id: 'fixture-actor', role: 'OWNER', tokenVersion: 1 } });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.rateLimit.mockResolvedValue(true);
  mocks.prisma.user.findUnique.mockImplementation(async ({ where, select }) => {
    if (select.passwordHash) return { passwordHash: 'fixture-hash' };
    if (where.id === 'fixture-target') return { id: where.id, role: 'USER', status: 'ACTIVE', tokenVersion: 2 };
    return { id: where.id, role: select.id ? mocks.role : mocks.transactionRole, status: 'ACTIVE', tokenVersion: 1 };
  });
  for (const model of [mocks.prisma.user, mocks.prisma.question, mocks.prisma.quiz, mocks.prisma.liveSession, mocks.prisma.category, mocks.prisma.auditLog]) {
    model.findMany.mockResolvedValue([]);
    model.count.mockResolvedValue(2);
    model.updateMany.mockResolvedValue({ count: 1 });
  }
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.userSubscription.findFirst.mockResolvedValue(null);
  mocks.prisma.userSubscription.updateMany.mockResolvedValue({ count: 1 });
});

describe('managed account boundaries use the current server identity', () => {
  const entryPoints = [
    ['page and search', () => UsersPage({ searchParams: Promise.resolve({ q: 'fixture@invalid.test' }) })],
    ['shared list query', () => listManagedUsers('fixture@invalid.test', 1)],
    ['update role / suspend / activate action', () => updateUserAccess(form())],
    ['grant action', () => grantUserSubscription(form())],
    ['cancel action', () => cancelUserSubscriptionAction(form())],
    ['shared grant service', () => grantSubscription({ userId: 'fixture-target', planCode: 'KNIGHT', grantedBy: 'fixture-actor' })],
    ['shared cancel service', () => cancelUserSubscription('fixture-target', 'fixture-sub')],
  ] as const;
  for (const role of ['ADMIN', 'MODERATOR', 'CONTENT_EDITOR', 'USER']) {
    it.each(entryPoints)(`${role} cannot call %s even with forged client role`, async (_label, invoke) => {
      mocks.role = role;
      await expect(invoke()).rejects.toThrow('REDIRECT:/forbidden');
      expect(mocks.prisma.user.findUnique).toHaveBeenCalledExactlyOnceWith({
        where: { id: 'fixture-actor' }, select: { id: true, role: true, status: true, tokenVersion: true },
      });
      expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
      expect(mocks.prisma.user.count).not.toHaveBeenCalled();
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      expect(mocks.prisma.userSubscription.updateMany).not.toHaveBeenCalled();
      expect(mocks.prisma.userSubscription.create).not.toHaveBeenCalled();
      expect(mocks.rateLimit).not.toHaveBeenCalled();
    });
  }
  it('lets the current director list and search after authorization', async () => {
    const result = await listManagedUsers('fixture', 2);
    expect(result).toEqual({ users: [], total: 2 });
    expect(mocks.prisma.user.findUnique.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.user.findMany.mock.invocationCallOrder[0]!);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20, where: expect.objectContaining({ OR: expect.any(Array) }) }));
  });
  it('keeps director role / status updates and subscription actions operational', async () => {
    await expect(updateUserAccess(form())).rejects.toThrow('REDIRECT:/admin/users?result=UPDATED');
    expect(mocks.prisma.user.updateMany).toHaveBeenCalled();
    await expect(grantUserSubscription(form())).rejects.toThrow('REDIRECT:/admin/users?result=SUBSCRIPTION_GRANTED');
    await expect(cancelUserSubscriptionAction(form())).rejects.toThrow('REDIRECT:/admin/users?result=SUBSCRIPTION_CANCELLED');
  });
  it('rechecks the director inside the update transaction before reading a target', async () => {
    mocks.transactionRole = 'ADMIN';
    await expect(updateUserAccess(form())).rejects.toThrow('SESSION_REVOKED');
    expect(mocks.prisma.user.findUnique.mock.calls.some(([args]) => args.where.id === 'fixture-target')).toBe(false);
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('rejects a forged grant actor before any target query', async () => {
    await expect(grantSubscription({ userId: 'fixture-target', planCode: 'KNIGHT', grantedBy: 'forged-actor' })).rejects.toThrow('Invalid subscription actor');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    ['MODERATOR', 'ACTIVE'], ['CONTENT_EDITOR', 'SUSPENDED'], ['ADMIN', 'ACTIVE'],
  ])('lets the director set %s / %s without granting director access', async (role, status) => {
    const data = form();
    data.set('role', role);
    data.set('status', status);
    await expect(updateUserAccess(data)).rejects.toThrow('result=UPDATED');
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { role, status } }));
  });
  it('redirects anonymous requests to the admin login without an account query', async () => {
    mocks.getServerSession.mockResolvedValue(null);
    await expect(listManagedUsers('', 1)).rejects.toThrow('REDIRECT:/admin/login?next=%2Fadmin%2Fusers');
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('leaves personal entitlement queries available without admin authorization', async () => {
    mocks.role = 'USER';
    mocks.prisma.userSubscription.findMany.mockResolvedValue([]);
    await expect(getDisplayPlanCode(mocks.prisma as never, 'fixture-actor', 'USER')).resolves.toBe('SPECTATOR');
    expect(mocks.getServerSession).not.toHaveBeenCalled();
  });
});

describe('other console sections omit account relations at query time', () => {
  it.each(['ADMIN', 'CONTENT_EDITOR'])('preserves content access for %s without selecting owners', async (role) => {
    mocks.role = role;
    mocks.prisma.question.findMany.mockResolvedValue([{ id: 'fixture-question', prompt: 'fixture content', difficulty: 'EASY', gameTypes: ['QUIZ'], status: 'PUBLISHED', _count: { options: 4 } }]);
    mocks.prisma.quiz.findMany.mockResolvedValue([{ id: 'fixture-quiz', title: 'fixture quiz', status: 'ACTIVE', _count: { questions: 4 } }]);
    const html = renderToStaticMarkup(await ContentPage({ searchParams: Promise.resolve({}) }));
    expect(mocks.prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ owner: false }) }));
    expect(mocks.prisma.quiz.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ owner: false }) }));
    expect(html).not.toContain('fixture@invalid.test');
  });
  it.each(['ADMIN', 'MODERATOR'])('preserves room moderation for %s without selecting host accounts', async (role) => {
    mocks.role = role;
    mocks.prisma.liveSession.findMany.mockResolvedValue([{ id: 'fixture-room', roomCode: 'fixture-code', status: 'ACTIVE', quiz: { title: 'fixture room' }, _count: { participants: 3 } }]);
    const html = renderToStaticMarkup(await RoomsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('fixture room');
    expect(mocks.prisma.liveSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ host: false }) }));
  });
  it('preserves admin audit and overview without actor, target or account resource identifiers', async () => {
    mocks.role = 'ADMIN';
    await AuditPage({ searchParams: Promise.resolve({}) });
    expect(mocks.prisma.auditLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ select: expect.objectContaining({ actor: false, targetUser: false, resourceId: false }) }));
    await OverviewPage();
    expect(mocks.prisma.auditLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ select: expect.objectContaining({ actor: false }) }));
  });
  it('retains account context in the director console', async () => {
    await ContentPage({ searchParams: Promise.resolve({}) });
    expect(mocks.prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ owner: { select: { name: true, email: true } } }) }));
    await RoomsPage({ searchParams: Promise.resolve({}) });
    await AuditPage({ searchParams: Promise.resolve({}) });
    await OverviewPage();
  });
});
