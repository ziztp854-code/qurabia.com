import {
  LOYALTY_HOSTED_SESSIONS,
  LOYALTY_REWARD_DAYS,
  LOYALTY_REWARD_PLAN,
  LOYALTY_WINDOW_DAYS,
  PLAN_VERSION,
  flagFor,
  isPlanCode,
  limitFor,
  planDefinition,
  planRank,
  type PlanCode,
} from '@tahaddi/domain';
export { limitFor };
import { hasPermission } from '@/lib/auth/authorization';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
export type QuotaKey = 'maxQuestionsPerMonth' | 'maxLiveRoomsPerMonth' | 'aiQuestionsPerMonth';
const QUOTA_COUNTER_KEYS: Record<QuotaKey, string> = {
  maxQuestionsPerMonth: 'questions_created',
  maxLiveRoomsPerMonth: 'live_rooms_started',
  aiQuestionsPerMonth: 'ai_generations',
};
export type QuotaSnapshot = {
  planCode: PlanCode;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
};
export type QuotaConsumption =
  ({ ok: true } & QuotaSnapshot) | ({ ok: false } & QuotaSnapshot & { message: string });
type PrismaClient = ReturnType<typeof getPrismaClient>;
/** Content managers and staff operate outside plan quotas. */ export function planBypassesLimits(
  role: unknown,
): boolean {
  return hasPermission(role, 'MANAGE_CONTENT');
}
function monthPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
export async function getActivePlanCode(prisma: PrismaClient, userId: string): Promise<PlanCode> {
  const now = new Date();
  await prisma.userSubscription.updateMany({
    where: { userId, status: 'ACTIVE', expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
  const active = await prisma.userSubscription.findMany({
    where: { userId, status: 'ACTIVE', expiresAt: { gt: now } },
    select: { planCode: true },
  });
  return (
    active
      .map((row) => row.planCode)
      .filter(isPlanCode)
      .sort((left, right) => planRank(right) - planRank(left))[0] ?? 'SPECTATOR'
  );
}

/**
 * الرتبة المعروضة على الواجهة: طاقم الإدارة صاحب صلاحية إدارة المحتوى
 * يعمل بلا حدود، فيُعرض وسامه كأرفع رتبة «السلطان» دون استعلام قاعدة البيانات.
 */
export async function getDisplayPlanCode(
  prisma: PrismaClient | null,
  userId: string,
  role: unknown,
): Promise<PlanCode> {
  if (planBypassesLimits(role)) return 'SULTAN';
  if (!prisma) return 'SPECTATOR';
  return getActivePlanCode(prisma, userId);
}

export async function quotaSnapshot(
  userId: string,
  key: QuotaKey,
  role: unknown,
): Promise<QuotaSnapshot> {
  const planCode = await getActivePlanCode(getPrismaClient(), userId);
  if (planBypassesLimits(role)) {
    return {
      planCode,
      used: 0,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      unlimited: true,
    };
  }
  const limit = limitFor(planCode, key);
  const counter = await getPrismaClient().usageCounter.findUnique({
    where: {
      userId_key_periodStart: {
        userId,
        key: QUOTA_COUNTER_KEYS[key],
        periodStart: monthPeriodStart(),
      },
    },
    select: { count: true },
  });
  const used = counter?.count ?? 0;
  return { planCode, used, limit, remaining: Math.max(0, limit - used), unlimited: false };
}
/** * Atomically consumes one unit of a monthly plan quota. * The guarded `updateMany` keeps concurrent requests race-free. */ export async function consumeQuota(
  userId: string,
  key: QuotaKey,
  role: unknown,
): Promise<QuotaConsumption> {
  const prisma = getPrismaClient();
  const planCode = await getActivePlanCode(prisma, userId);
  const base = { planCode, used: 0, limit: 0, remaining: 0, unlimited: false };
  if (planBypassesLimits(role)) {
    return {
      ok: true,
      ...base,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      unlimited: true,
    };
  }
  const limit = limitFor(planCode, key);
  const periodStart = monthPeriodStart();
  const counterKey = QUOTA_COUNTER_KEYS[key];
  try {
    await prisma.usageCounter.create({ data: { userId, key: counterKey, periodStart, count: 0 } });
  } catch (error) {
    const isConflict =
      error instanceof Object && String((error as { code?: string }).code) === 'P2002';
    if (!isConflict) throw error;
  }
  const bumped = await prisma.usageCounter.updateMany({
    where: { userId, key: counterKey, periodStart, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  if (bumped.count === 1) {
    const counter = await prisma.usageCounter.findUnique({
      where: { userId_key_periodStart: { userId, key: counterKey, periodStart } },
      select: { count: true },
    });
    const used = counter?.count ?? 1;
    return {
      ok: true,
      planCode,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      unlimited: false,
    };
  }
  const existing = await prisma.usageCounter.findUnique({
    where: { userId_key_periodStart: { userId, key: counterKey, periodStart } },
    select: { count: true },
  });
  const used = existing?.count ?? limit;
  return {
    ok: false,
    planCode,
    used,
    limit,
    remaining: 0,
    unlimited: false,
    message:
      planCode === 'SPECTATOR'
        ? 'استهلكت رتبة «المشاهد» حدودها الشهرية. ترقّم في قاعة الأوسمة لمزيد من الإمكانيات.'
        : `بلغت حد رتبتك لهذا الشهر (${limit}). راجع قاعة الأوسمة للترقية.`,
  };
}
/** Refunds a previously consumed quota unit when the operation fails. */ export async function refundQuota(
  userId: string,
  key: QuotaKey,
): Promise<void> {
  await getPrismaClient().usageCounter.updateMany({
    where: {
      userId,
      key: QUOTA_COUNTER_KEYS[key],
      periodStart: monthPeriodStart(),
      count: { gt: 0 },
    },
    data: { count: { decrement: 1 } },
  });
}
export type RedeemStampResult =
  { ok: true; planCode: PlanCode; expiresAt: Date } | { ok: false; message: string };
const CODE_PATTERN = /^[A-Z0-9-]{6,32}$/;
export async function redeemStamp(userId: string, rawCode: string): Promise<RedeemStampResult> {
  if (!hasDatabaseUrl()) {
    return { ok: false, message: 'قاعدة البيانات غير مهيأة بعد.' };
  }
  const code = rawCode.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    return { ok: false, message: 'صيغة الختم غير صحيحة.' };
  }
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const stamp = await tx.subscriptionStamp.findUnique({ where: { code } });
    if (!stamp) {
      return { ok: false, message: 'لم يُعثر على هذا الختم. تحقق من الرمز.' };
    }
    if (stamp.status === 'REVOKED') {
      return { ok: false, message: 'هذا الختم أُلغي ولا يمكن استخدامه.' };
    }
    if (stamp.status === 'REDEEMED') {
      return { ok: false, message: 'هذا الختم استُخدم من قبل.' };
    }
    if (!isPlanCode(stamp.planCode)) {
      return { ok: false, message: 'ختم يشير إلى رتبة غير معروفة.' };
    }
    const now = new Date();
    const current = await tx.userSubscription.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: now } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, planCode: true, expiresAt: true },
    });
    let base = now;
    if (current && isPlanCode(current.planCode)) {
      if (planRank(stamp.planCode) < planRank(current.planCode)) {
        return {
          ok: false,
          message: `رتبتك الحالية أعلى من رتبة الختم (${stamp.planCode === 'SPECTATOR' ? 'المشاهد' : stamp.planCode}).`,
        };
      }
      if (planRank(stamp.planCode) === planRank(current.planCode)) {
        base = current.expiresAt > now ? current.expiresAt : now;
      }
      if (current.planCode !== stamp.planCode) {
        await tx.userSubscription.update({
          where: { id: current.id },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
      }
    }
    const expiresAt = new Date(base.getTime() + stamp.durationDays * 24 * 60 * 60 * 1_000);
    await tx.subscriptionStamp.update({
      where: { id: stamp.id },
      data: { status: 'REDEEMED', redeemedBy: userId, redeemedAt: now },
    });
    await tx.userSubscription.create({
      data: {
        userId,
        planCode: stamp.planCode,
        planVersion: stamp.planVersion,
        status: 'ACTIVE',
        source: 'STAMP',
        stampId: stamp.id,
        startedAt: now,
        expiresAt,
      },
    });
    return { ok: true, planCode: stamp.planCode, expiresAt };
  });
}
export type LoyaltyClaimResult =
  | { ok: true; planCode: PlanCode; expiresAt: Date; hostedCount: number }
  | { ok: false; message: string; hostedCount?: number; needed?: number };
/** * «وفاء البلاط»: استضافة LOYALTY_HOSTED_SESSIONS جولة مكتملة خلال * LOYALTY_WINDOW_DAYS يومًا تمنح ختم الفارس مجانيًا لمدة أسبوع. */ export async function claimLoyaltyReward(
  userId: string,
): Promise<LoyaltyClaimResult> {
  if (!hasDatabaseUrl()) {
    return { ok: false, message: 'قاعدة البيانات غير مهيأة بعد.' };
  }
  const prisma = getPrismaClient();
  const windowStart = new Date(Date.now() - LOYALTY_WINDOW_DAYS * 24 * 60 * 60 * 1_000);
  const hostedCount = await prisma.liveSession.count({
    where: { hostId: userId, status: 'FINISHED', endedAt: { gte: windowStart } },
  });
  if (hostedCount < LOYALTY_HOSTED_SESSIONS) {
    return {
      ok: false,
      hostedCount,
      needed: LOYALTY_HOSTED_SESSIONS,
      message: `استضف ${LOYALTY_HOSTED_SESSIONS} جولات مكتملة خلال ${LOYALTY_WINDOW_DAYS} يومًا لتستحق ختم الوفاء. أنجزت ${hostedCount} حتى الآن.`,
    };
  }
  const lastClaim = await prisma.userSubscription.findFirst({
    where: { userId, source: 'ACHIEVEMENT', planCode: LOYALTY_REWARD_PLAN },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  const cooldownMs = LOYALTY_REWARD_DAYS * 24 * 60 * 60 * 1_000;
  if (lastClaim && Date.now() - lastClaim.startedAt.getTime() < cooldownMs) {
    const nextDate = new Date(lastClaim.startedAt.getTime() + cooldownMs);
    return {
      ok: false,
      hostedCount,
      message: `طُلب ختم الوفاء مؤخرًا. يمكنك المطالبة مجددًا بعد ${nextDate.toLocaleDateString('ar')}.`,
    };
  }
  const now = new Date();
  const current = await prisma.userSubscription.findFirst({
    where: { userId, status: 'ACTIVE', expiresAt: { gt: now }, planCode: LOYALTY_REWARD_PLAN },
    orderBy: { expiresAt: 'desc' },
    select: { expiresAt: true },
  });
  const base = current && current.expiresAt > now ? current.expiresAt : now;
  const expiresAt = new Date(base.getTime() + LOYALTY_REWARD_DAYS * 24 * 60 * 60 * 1_000);
  await prisma.userSubscription.create({
    data: {
      userId,
      planCode: LOYALTY_REWARD_PLAN,
      planVersion: PLAN_VERSION,
      status: 'ACTIVE',
      source: 'ACHIEVEMENT',
      startedAt: now,
      expiresAt,
    },
  });
  return { ok: true, planCode: LOYALTY_REWARD_PLAN, expiresAt, hostedCount };
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCodeBlock(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}
const PLAN_CODE_PREFIX: Record<PlanCode, string> = {
  SPECTATOR: 'SPC',
  KNIGHT: 'KNT',
  PRINCE: 'PRC',
  SULTAN: 'SLT',
};
export type IssueStampsInput = {
  issuedBy: string;
  planCode: string;
  count: number;
  durationDays?: number;
  note?: string;
};
export async function issueStamps(input: IssueStampsInput): Promise<string[]> {
  if (!isPlanCode(input.planCode)) {
    throw new Error('رتبة غير معروفة.');
  }
  const count = Math.min(Math.max(Math.trunc(input.count), 1), 100);
  const durationDays =
    input.durationDays && input.durationDays > 0
      ? Math.min(input.durationDays, 365)
      : planDefinition(input.planCode).durationDays;
  const prisma = getPrismaClient();
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = `THD-${PLAN_CODE_PREFIX[input.planCode]}-${randomCodeBlock(4)}-${randomCodeBlock(4)}`;
      try {
        await prisma.subscriptionStamp.create({
          data: {
            code,
            planCode: input.planCode,
            planVersion: PLAN_VERSION,
            durationDays,
            note: input.note?.slice(0, 200) || null,
            issuedBy: input.issuedBy,
          },
        });
        codes.push(code);
        break;
      } catch (error) {
        const isCollision =
          error instanceof Object && String((error as { code?: string }).code) === 'P2002';
        if (!isCollision || attempt === 5) throw error;
      }
    }
  }
  return codes;
}

export async function revokeStamp(stampId: string): Promise<boolean> {
  const result = await getPrismaClient().subscriptionStamp.updateMany({
    where: { id: stampId, status: 'UNUSED' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
  return result.count === 1;
}
export type PlanFlagKey = 'deepReports' | 'customRoomBranding' | 'earlyAccessGames';

/**
 * يتحقق من امتياز علمي في خطة المستخدم النشطة.
 * طاقم إدارة المحتوى يتخطى القيود كافة.
 */
export async function hasPlanFlag(
  prisma: PrismaClient,
  userId: string,
  key: PlanFlagKey,
  role?: unknown,
): Promise<boolean> {
  if (role !== undefined && planBypassesLimits(role)) return true;
  const planCode = await getActivePlanCode(prisma, userId);
  return flagFor(planCode, key);
}
export type GrantSubscriptionInput = {
  userId: string;
  planCode: string;
  durationDays?: number;
  grantedBy: string;
};
export type GrantSubscriptionResult =
  { ok: true; planCode: PlanCode; expiresAt: Date } | { ok: false; message: string };

const GRANTED_PLAN_CODES: readonly PlanCode[] = ['KNIGHT', 'PRINCE', 'SULTAN'];

/**
 * يمنح اشتراكًا مباشرًا من الإدارة بنفس دلالات تفعيل الختم:
 * رتبة أدنى مرفوضة، ورتبة مماثلة تُمدّد، ورتبة أعلى تستبدل السارية.
 */
export async function grantSubscription(
  input: GrantSubscriptionInput,
): Promise<GrantSubscriptionResult> {
  if (!isPlanCode(input.planCode) || !GRANTED_PLAN_CODES.includes(input.planCode)) {
    return { ok: false, message: 'رتبة غير قابلة للمنح.' };
  }
  const planCode: PlanCode = input.planCode;
  const durationDays =
    input.durationDays && input.durationDays > 0
      ? Math.min(Math.trunc(input.durationDays), 365)
      : planDefinition(planCode).durationDays;
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, status: true },
    });
    if (!target || target.status === 'DELETED') {
      return { ok: false, message: 'لم يُعثر على هذا الحساب.' };
    }
    const now = new Date();
    const current = await tx.userSubscription.findFirst({
      where: { userId: input.userId, status: 'ACTIVE', expiresAt: { gt: now } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, planCode: true, expiresAt: true },
    });
    let base = now;
    if (current && isPlanCode(current.planCode)) {
      if (planRank(planCode) < planRank(current.planCode)) {
        return { ok: false, message: `رتبة المستخدم الحالية أعلى من رتبة المنحة.` };
      }
      if (planRank(planCode) === planRank(current.planCode)) {
        base = current.expiresAt > now ? current.expiresAt : now;
      }
      if (current.planCode !== input.planCode) {
        await tx.userSubscription.update({
          where: { id: current.id },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
      }
    }
    const expiresAt = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1_000);
    await tx.userSubscription.create({
      data: {
        userId: input.userId,
        planCode,
        planVersion: PLAN_VERSION,
        status: 'ACTIVE',
        source: 'ADMIN',
        startedAt: now,
        expiresAt,
      },
    });
    return { ok: true, planCode, expiresAt };
  });
}

/** يلغي اشتراكًا ساريًا لمستخدم محدد. */
export async function cancelUserSubscription(
  userId: string,
  subscriptionId: string,
): Promise<boolean> {
  const result = await getPrismaClient().userSubscription.updateMany({
    where: { id: subscriptionId, userId, status: 'ACTIVE' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  return result.count === 1;
}
