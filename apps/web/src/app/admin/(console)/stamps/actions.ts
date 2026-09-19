'use server';

import { revalidatePath } from 'next/cache';
import { isPlanCode } from '@tahaddi/domain';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { issueStamps, revokeStamp } from '@/lib/subscription/entitlements';

export type StampActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  issuedCodes?: string[];
};

export async function issueStampsAction(
  _previousState: StampActionState,
  formData: FormData,
): Promise<StampActionState> {
  const actor = await requirePermission('MANAGE_USERS', '/admin/stamps');
  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'قاعدة البيانات غير مهيأة بعد.' };
  }
  const prisma = getPrismaClient();
  if (!(await checkRateLimit(`admin-stamps-issue:${actor.id}`))) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'STAMP_ISSUE',
        resourceType: 'SubscriptionStamp',
        result: 'DENIED',
        reasonCode: 'RATE_LIMITED',
      },
    });
    return { status: 'error', message: 'بلغت الحد المؤقت. حاول لاحقًا.' };
  }

  const planCode = String(formData.get('planCode') ?? '');
  const count = Number(formData.get('count') ?? 1);
  const durationDays = Number(formData.get('durationDays') ?? 0);
  const note = String(formData.get('note') ?? '').trim();

  if (!isPlanCode(planCode) || planCode === 'SPECTATOR') {
    return { status: 'error', message: 'اختر رتبة صالحة للختم (الفارس أو أرفع).' };
  }
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    return { status: 'error', message: 'عدد الأختام يجب أن يكون بين 1 و 100.' };
  }
  if (durationDays && (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 365)) {
    return { status: 'error', message: 'المدة يجب أن تكون بين يوم واحد و 365 يومًا.' };
  }

  try {
    const codes = await issueStamps({
      issuedBy: actor.id,
      planCode,
      count,
      durationDays: durationDays || undefined,
      note: note || undefined,
    });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'STAMP_ISSUE',
        resourceType: 'SubscriptionStamp',
        result: 'SUCCESS',
        before: undefined,
        after: { planCode, count, durationDays: durationDays || null },
      },
    });
    revalidatePath('/admin/stamps');
    return {
      status: 'success',
      message: `صدر ${codes.length} ختمًا من رتبة «${planCode}». انسخها الآن — لن تُعرض رموزها مجددًا.`,
      issuedCodes: codes,
    };
  } catch {
    return { status: 'error', message: 'تعذّر إصدار الأختام الآن. حاول مجددًا.' };
  }
}

export async function revokeStampAction(formData: FormData) {
  const actor = await requirePermission('MANAGE_USERS', '/admin/stamps');
  const stampId = String(formData.get('stampId') ?? '');
  if (!stampId) return;
  const revoked = await revokeStamp(stampId);
  await getPrismaClient().auditLog.create({
    data: {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'STAMP_REVOKE',
      resourceType: 'SubscriptionStamp',
      resourceId: stampId,
      result: revoked ? 'SUCCESS' : 'DENIED',
      reasonCode: revoked ? null : 'ALREADY_PROCESSED',
    },
  });
  revalidatePath('/admin/stamps');
}
