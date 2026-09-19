import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelUserSubscription,
  claimLoyaltyReward,
  consumeQuota,
  getDisplayPlanCode,
  grantSubscription,
  hasPlanFlag,
  redeemStamp,
} from './entitlements';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
    },
    userSubscription: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    usageCounter: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    subscriptionStamp: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    liveSession: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => prisma,
  hasDatabaseUrl: () => true,
}));

describe('subscription entitlements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof prisma) => unknown) =>
      callback(prisma),
    );
    prisma.userSubscription.updateMany.mockResolvedValue({ count: 0 });
    prisma.userSubscription.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });
    prisma.usageCounter.create.mockResolvedValue({
      userId: 'user-1',
      key: 'live_rooms_started',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      count: 0,
    });
  });

  describe('consumeQuota', () => {
    it('allows consumption within the spectator plan limit', async () => {
      prisma.usageCounter.updateMany.mockResolvedValue({ count: 1 });
      prisma.usageCounter.findUnique.mockResolvedValue({ count: 4 });

      const result = await consumeQuota('user-1', 'maxLiveRoomsPerMonth', 'USER');

      expect(result).toMatchObject({ ok: true, planCode: 'SPECTATOR', used: 4, limit: 5 });
    });

    it('seeds the usage counter on first use instead of reporting the limit reached', async () => {
      prisma.usageCounter.updateMany.mockResolvedValue({ count: 1 });
      prisma.usageCounter.findUnique.mockResolvedValue({ count: 1 });

      const result = await consumeQuota('user-1', 'maxLiveRoomsPerMonth', 'USER');

      expect(prisma.usageCounter.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ ok: true, used: 1, limit: 5 });
    });

    it('keeps the existing counter when it already exists for the period', async () => {
      prisma.usageCounter.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
      prisma.usageCounter.updateMany.mockResolvedValue({ count: 1 });
      prisma.usageCounter.findUnique.mockResolvedValue({ count: 2 });

      const result = await consumeQuota('user-1', 'maxLiveRoomsPerMonth', 'USER');

      expect(result).toMatchObject({ ok: true, used: 2, limit: 5 });
    });

    it('rejects consumption once the plan limit is reached', async () => {
      prisma.usageCounter.updateMany.mockResolvedValue({ count: 0 });
      prisma.usageCounter.findUnique.mockResolvedValue({ count: 5 });

      const result = await consumeQuota('user-1', 'maxLiveRoomsPerMonth', 'USER');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('المشاهد');
      }
    });

    it('lets content managers bypass plan quotas', async () => {
      const result = await consumeQuota('user-1', 'aiQuestionsPerMonth', 'ADMIN');

      expect(result).toMatchObject({ ok: true, unlimited: true });
      expect(prisma.usageCounter.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('redeemStamp', () => {
    it('redeems a valid knight stamp and starts a subscription', async () => {
      const expiresAt = new Date('2026-10-05T12:00:00.000Z');
      prisma.subscriptionStamp.findUnique.mockResolvedValue({
        id: 'stamp-1',
        code: 'THD-KNT-AAAA-BBBB',
        planCode: 'KNIGHT',
        planVersion: 1,
        durationDays: 30,
        status: 'UNUSED',
      });
      prisma.userSubscription.findFirst.mockResolvedValue(null);
      prisma.subscriptionStamp.update.mockResolvedValue({});
      prisma.userSubscription.create.mockResolvedValue({ expiresAt });

      const result = await redeemStamp('user-1', ' thd-knt-aaaa-bbbb ');

      expect(result).toMatchObject({ ok: true, planCode: 'KNIGHT' });
      expect(prisma.userSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          planCode: 'KNIGHT',
          status: 'ACTIVE',
          source: 'STAMP',
          stampId: 'stamp-1',
        }),
      });
    });

    it('rejects an already redeemed stamp', async () => {
      prisma.subscriptionStamp.findUnique.mockResolvedValue({
        id: 'stamp-1',
        code: 'THD-KNT-AAAA-BBBB',
        planCode: 'KNIGHT',
        planVersion: 1,
        durationDays: 30,
        status: 'REDEEMED',
      });

      const result = await redeemStamp('user-1', 'THD-KNT-AAAA-BBBB');

      expect(result.ok).toBe(false);
      expect(prisma.userSubscription.create).not.toHaveBeenCalled();
    });

    it('stacks same-plan stamps onto the current expiry', async () => {
      prisma.subscriptionStamp.findUnique.mockResolvedValue({
        id: 'stamp-2',
        code: 'THD-PRC-CCCC-DDDD',
        planCode: 'PRINCE',
        planVersion: 1,
        durationDays: 30,
        status: 'UNUSED',
      });
      prisma.userSubscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        planCode: 'PRINCE',
        expiresAt: new Date('2026-09-20T12:00:00.000Z'),
      });
      prisma.userSubscription.create.mockResolvedValue({});

      const result = await redeemStamp('user-1', 'THD-PRC-CCCC-DDDD');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.expiresAt.toISOString()).toBe('2026-10-20T12:00:00.000Z');
      }
      expect(prisma.userSubscription.update).not.toHaveBeenCalled();
    });

    it('cancels the lower active rank when a higher stamp is redeemed', async () => {
      prisma.subscriptionStamp.findUnique.mockResolvedValue({
        id: 'stamp-3',
        code: 'THD-SLT-EEEE-FFFF',
        planCode: 'SULTAN',
        planVersion: 1,
        durationDays: 30,
        status: 'UNUSED',
      });
      prisma.userSubscription.findFirst.mockResolvedValue({
        id: 'sub-knight',
        planCode: 'KNIGHT',
        expiresAt: new Date('2026-10-01T12:00:00.000Z'),
      });
      prisma.userSubscription.create.mockResolvedValue({});
      prisma.userSubscription.update.mockResolvedValue({});

      const result = await redeemStamp('user-1', 'THD-SLT-EEEE-FFFF');

      expect(result.ok).toBe(true);
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-knight' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
    });

    it('refuses a downgrade stamp', async () => {
      prisma.subscriptionStamp.findUnique.mockResolvedValue({
        id: 'stamp-4',
        code: 'THD-KNT-AAAA-BBBB',
        planCode: 'KNIGHT',
        planVersion: 1,
        durationDays: 30,
        status: 'UNUSED',
      });
      prisma.userSubscription.findFirst.mockResolvedValue({
        id: 'sub-sultan',
        planCode: 'SULTAN',
        expiresAt: new Date('2026-10-01T12:00:00.000Z'),
      });

      const result = await redeemStamp('user-1', 'THD-KNT-AAAA-BBBB');

      expect(result.ok).toBe(false);
      expect(prisma.userSubscription.create).not.toHaveBeenCalled();
    });
  });

  describe('claimLoyaltyReward', () => {
    it('declines until the hosted session threshold is met', async () => {
      prisma.liveSession.count.mockResolvedValue(3);

      const result = await claimLoyaltyReward('user-1');

      expect(result).toMatchObject({ ok: false, hostedCount: 3, needed: 5 });
      expect(prisma.userSubscription.create).not.toHaveBeenCalled();
    });

    it('grants a weekly knight stamp once the host earns it', async () => {
      prisma.liveSession.count.mockResolvedValue(6);
      prisma.userSubscription.findFirst.mockResolvedValue(null);
      prisma.userSubscription.create.mockResolvedValue({});

      const result = await claimLoyaltyReward('user-1');

      expect(result).toMatchObject({ ok: true, planCode: 'KNIGHT' });
      expect(prisma.userSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          planCode: 'KNIGHT',
          source: 'ACHIEVEMENT',
          status: 'ACTIVE',
        }),
      });
    });

    it('enforces the weekly cooldown between claims', async () => {
      prisma.liveSession.count.mockResolvedValue(9);
      prisma.userSubscription.findFirst.mockResolvedValueOnce({
        startedAt: new Date('2026-09-03T12:00:00.000Z'),
      });

      const result = await claimLoyaltyReward('user-1');

      expect(result.ok).toBe(false);
      expect(prisma.userSubscription.create).not.toHaveBeenCalled();
    });
  });

  describe('grantSubscription', () => {
    it('refuses a non-grantable plan', async () => {
      const result = await grantSubscription({
        userId: 'user-1',
        planCode: 'SPECTATOR',
        grantedBy: 'admin-1',
      });

      expect(result.ok).toBe(false);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('grants an admin subscription when the user has none active', async () => {
      prisma.userSubscription.findFirst.mockResolvedValue(null);
      prisma.userSubscription.create.mockResolvedValue({});

      const result = await grantSubscription({
        userId: 'user-1',
        planCode: 'PRINCE',
        grantedBy: 'admin-1',
      });

      expect(result).toMatchObject({ ok: true, planCode: 'PRINCE' });
      expect(result.ok && result.expiresAt.toISOString()).toBe('2026-10-05T12:00:00.000Z');
      expect(prisma.userSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          planCode: 'PRINCE',
          status: 'ACTIVE',
          source: 'ADMIN',
        }),
      });
    });

    it('refuses a grant below the user’s current rank', async () => {
      prisma.userSubscription.findFirst.mockResolvedValue({
        id: 'sub-prince',
        planCode: 'PRINCE',
        expiresAt: new Date('2026-10-01T12:00:00.000Z'),
      });

      const result = await grantSubscription({
        userId: 'user-1',
        planCode: 'KNIGHT',
        grantedBy: 'admin-1',
      });

      expect(result.ok).toBe(false);
      expect(prisma.userSubscription.create).not.toHaveBeenCalled();
    });

    it('stacks a same-rank grant onto the current expiry', async () => {
      prisma.userSubscription.findFirst.mockResolvedValue({
        id: 'sub-knight',
        planCode: 'KNIGHT',
        expiresAt: new Date('2026-09-10T12:00:00.000Z'),
      });
      prisma.userSubscription.create.mockResolvedValue({});

      const result = await grantSubscription({
        userId: 'user-1',
        planCode: 'KNIGHT',
        durationDays: 7,
        grantedBy: 'admin-1',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.expiresAt.toISOString()).toBe('2026-09-17T12:00:00.000Z');
      }
      expect(prisma.userSubscription.update).not.toHaveBeenCalled();
    });

    it('cancels the lower active rank when a higher rank is granted', async () => {
      prisma.userSubscription.findFirst.mockResolvedValue({
        id: 'sub-knight',
        planCode: 'KNIGHT',
        expiresAt: new Date('2026-09-10T12:00:00.000Z'),
      });
      prisma.userSubscription.create.mockResolvedValue({});
      prisma.userSubscription.update.mockResolvedValue({});

      const result = await grantSubscription({
        userId: 'user-1',
        planCode: 'SULTAN',
        grantedBy: 'admin-1',
      });

      expect(result.ok).toBe(true);
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-knight' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
    });

    it('refuses a deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-9', status: 'DELETED' });

      const result = await grantSubscription({
        userId: 'user-9',
        planCode: 'KNIGHT',
        grantedBy: 'admin-1',
      });

      expect(result.ok).toBe(false);
      expect(prisma.userSubscription.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelUserSubscription', () => {
    it('cancels an active subscription of the user', async () => {
      prisma.userSubscription.updateMany.mockResolvedValue({ count: 1 });

      const result = await cancelUserSubscription('user-1', 'sub-1');

      expect(result).toBe(true);
      expect(prisma.userSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub-1', userId: 'user-1', status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
    });

    it('returns false when nothing matched', async () => {
      prisma.userSubscription.updateMany.mockResolvedValue({ count: 0 });

      const result = await cancelUserSubscription('user-1', 'sub-missing');

      expect(result).toBe(false);
    });
  });

  describe('hasPlanFlag', () => {
    it('denies early access on the spectator plan', async () => {
      const result = await hasPlanFlag(prisma as never, 'user-1', 'earlyAccessGames', 'USER');

      expect(result).toBe(false);
    });

    it('grants early access on the sultan plan', async () => {
      prisma.userSubscription.findMany.mockResolvedValue([{ planCode: 'SULTAN' }]);

      const result = await hasPlanFlag(prisma as never, 'user-1', 'earlyAccessGames', 'USER');

      expect(result).toBe(true);
    });

    it('bypasses the flag for content managers', async () => {
      const result = await hasPlanFlag(prisma as never, 'user-1', 'deepReports', 'ADMIN');

      expect(result).toBe(true);
      expect(prisma.userSubscription.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getDisplayPlanCode', () => {
    it('displays staff with content management as the sultan rank without touching the database', async () => {
      for (const role of ['OWNER', 'ADMIN', 'CONTENT_EDITOR']) {
        prisma.userSubscription.updateMany.mockClear();
        prisma.userSubscription.findMany.mockClear();

        const planCode = await getDisplayPlanCode(prisma as never, 'user-1', role);

        expect(planCode).toBe('SULTAN');
        expect(prisma.userSubscription.findMany).not.toHaveBeenCalled();
      }
    });

    it('resolves the active plan for regular users', async () => {
      prisma.userSubscription.findMany.mockResolvedValue([{ planCode: 'KNIGHT' }]);

      const planCode = await getDisplayPlanCode(prisma as never, 'user-1', 'USER');

      expect(planCode).toBe('KNIGHT');
    });

    it('falls back to the spectator rank without a database client', async () => {
      const planCode = await getDisplayPlanCode(null, 'user-1', 'USER');

      expect(planCode).toBe('SPECTATOR');
    });
  });
});
