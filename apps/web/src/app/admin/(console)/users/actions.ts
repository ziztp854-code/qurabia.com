'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { decideUserManagementUpdate, MANAGED_USER_STATUSES } from '@/lib/admin/user-policy';
import { MANAGED_APP_ROLES, isAppRole } from '@/lib/auth/authorization';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { getPrismaClient } from '@/lib/auth/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { requirePermission } from '@/lib/auth/session';
import { cancelUserSubscription, grantSubscription } from '@/lib/subscription/entitlements';

const updateUserSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  role: z.enum(MANAGED_APP_ROLES),
  status: z.enum(MANAGED_USER_STATUSES),
  expectedTokenVersion: z.coerce.number().int().min(0),
  currentPassword: z.string().min(8).max(128),
});

function usersResult(code: string): never {
  redirect(`/admin/users?result=${encodeURIComponent(code)}`);
}

export async function updateUserAccess(formData: FormData) {
  const actor = await requirePermission('MANAGE_USERS', '/admin/users');
  await requirePermission('MANAGE_ROLES', '/admin/users');
  const prisma = getPrismaClient();
  if (!(await checkRateLimit(`admin-user-update:${actor.id}`))) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'USER_ACCESS_UPDATE',
        resourceType: 'User',
        result: 'DENIED',
        reasonCode: 'RATE_LIMITED',
      },
    });
    usersResult('RATE_LIMITED');
  }

  const parsed = updateUserSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role'),
    status: formData.get('status'),
    expectedTokenVersion: formData.get('expectedTokenVersion'),
    currentPassword: formData.get('currentPassword'),
  });
  if (!parsed.success) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'USER_ACCESS_UPDATE',
        resourceType: 'User',
        result: 'DENIED',
        reasonCode: 'INVALID_REQUEST',
      },
    });
    usersResult('INVALID_REQUEST');
  }

  const actorCredentials = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true },
  });
  const reauthenticated = await verifyPassword(
    parsed.data.currentPassword,
    actorCredentials?.passwordHash,
  );

  if (!reauthenticated) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'USER_ACCESS_UPDATE',
        resourceType: 'User',
        resourceId: parsed.data.userId,
        result: 'DENIED',
        reasonCode: 'REAUTHENTICATION_FAILED',
      },
    });
    usersResult('REAUTHENTICATION_FAILED');
  }

  let result = 'UPDATED';
  try {
    result = await prisma.$transaction(
      async (transaction) => {
        const currentActor = await transaction.user.findUnique({
          where: { id: actor.id },
          select: { role: true, status: true, tokenVersion: true },
        });
        if (
          (currentActor?.role !== 'ADMIN' && currentActor?.role !== 'OWNER') ||
          currentActor.status !== 'ACTIVE' ||
          currentActor.tokenVersion !== actor.tokenVersion
        ) {
          await transaction.auditLog.create({
            data: {
              actorId: currentActor ? actor.id : null,
              actorRole: currentActor?.role ?? actor.role,
              action: 'USER_ACCESS_UPDATE',
              resourceType: 'User',
              result: 'DENIED',
              reasonCode: 'SESSION_REVOKED',
            },
          });
          return 'SESSION_REVOKED';
        }

        const target = await transaction.user.findUnique({
          where: { id: parsed.data.userId },
          select: { id: true, role: true, status: true, tokenVersion: true },
        });
        if (!target || !isAppRole(target.role)) {
          await transaction.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'USER_ACCESS_UPDATE',
              resourceType: 'User',
              resourceId: parsed.data.userId,
              result: 'DENIED',
              reasonCode: 'INVALID_REQUEST',
            },
          });
          return 'INVALID_REQUEST';
        }

        const activeAdminCount = await transaction.user.count({
          where: { role: 'ADMIN', status: 'ACTIVE' },
        });
        const decision = decideUserManagementUpdate({
          actorId: actor.id,
          target: { ...target, role: target.role },
          requestedRole: parsed.data.role,
          requestedStatus: parsed.data.status,
          expectedTokenVersion: parsed.data.expectedTokenVersion,
          activeAdminCount,
        });

        if (!decision.allowed) {
          await transaction.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'USER_ACCESS_UPDATE',
              resourceType: 'User',
              resourceId: target.id,
              targetUserId: target.id,
              result: 'DENIED',
              reasonCode: decision.reason,
            },
          });
          return decision.reason;
        }

        const update = await transaction.user.updateMany({
          where: { id: target.id, tokenVersion: target.tokenVersion },
          data: { role: parsed.data.role, status: parsed.data.status },
        });
        if (update.count !== 1) {
          await transaction.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'USER_ACCESS_UPDATE',
              resourceType: 'User',
              resourceId: target.id,
              targetUserId: target.id,
              result: 'DENIED',
              reasonCode: 'STALE_USER_VERSION',
            },
          });
          return 'STALE_USER_VERSION';
        }

        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'USER_ACCESS_UPDATE',
            resourceType: 'User',
            resourceId: target.id,
            targetUserId: target.id,
            result: 'SUCCESS',
            before: { role: target.role, status: target.status },
            after: { role: parsed.data.role, status: parsed.data.status },
          },
        });
        return 'UPDATED';
      },
      { isolationLevel: 'Serializable' },
    );
  } catch {
    result = 'REQUEST_FAILED';
  }

  revalidatePath('/admin');
  revalidatePath('/admin/users');
  usersResult(result);
}

const grantSubscriptionSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  planCode: z.enum(['KNIGHT', 'PRINCE', 'SULTAN']),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function grantUserSubscription(formData: FormData) {
  const actor = await requirePermission('MANAGE_USERS', '/admin/users');
  const prisma = getPrismaClient();
  if (!(await checkRateLimit(`admin-user-subscription:${actor.id}`))) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_GRANT',
        resourceType: 'UserSubscription',
        result: 'DENIED',
        reasonCode: 'RATE_LIMITED',
      },
    });
    usersResult('RATE_LIMITED');
  }

  const parsed = grantSubscriptionSchema.safeParse({
    userId: formData.get('userId'),
    planCode: formData.get('planCode'),
    durationDays: formData.get('durationDays') || undefined,
  });
  if (!parsed.success) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_GRANT',
        resourceType: 'UserSubscription',
        result: 'DENIED',
        reasonCode: 'INVALID_REQUEST',
      },
    });
    usersResult('INVALID_REQUEST');
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, role: true, status: true },
  });
  if (!target || target.status === 'DELETED' || target.role === 'OWNER') {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_GRANT',
        resourceType: 'UserSubscription',
        resourceId: parsed.data.userId,
        targetUserId: parsed.data.userId,
        result: 'DENIED',
        reasonCode: 'PROTECTED_MANAGER',
      },
    });
    usersResult('PROTECTED_MANAGER');
  }

  let result = 'SUBSCRIPTION_GRANTED';
  try {
    const granted = await grantSubscription({
      userId: parsed.data.userId,
      planCode: parsed.data.planCode,
      durationDays: parsed.data.durationDays,
      grantedBy: actor.id,
    });
    result = granted.ok ? 'SUBSCRIPTION_GRANTED' : 'SUBSCRIPTION_DENIED';
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_GRANT',
        resourceType: 'UserSubscription',
        resourceId: parsed.data.userId,
        targetUserId: parsed.data.userId,
        result: granted.ok ? 'SUCCESS' : 'DENIED',
        reasonCode: granted.ok ? undefined : 'SUBSCRIPTION_DENIED',
        after: granted.ok
          ? { planCode: granted.planCode, expiresAt: granted.expiresAt.toISOString() }
          : undefined,
      },
    });
  } catch {
    result = 'REQUEST_FAILED';
  }

  revalidatePath('/admin/users');
  revalidatePath('/orders');
  usersResult(result);
}

const cancelSubscriptionSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  subscriptionId: z.string().trim().min(1).max(64),
});

export async function cancelUserSubscriptionAction(formData: FormData) {
  const actor = await requirePermission('MANAGE_USERS', '/admin/users');
  const prisma = getPrismaClient();
  if (!(await checkRateLimit(`admin-user-subscription:${actor.id}`))) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_CANCEL',
        resourceType: 'UserSubscription',
        result: 'DENIED',
        reasonCode: 'RATE_LIMITED',
      },
    });
    usersResult('RATE_LIMITED');
  }

  const parsed = cancelSubscriptionSchema.safeParse({
    userId: formData.get('userId'),
    subscriptionId: formData.get('subscriptionId'),
  });
  if (!parsed.success) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_CANCEL',
        resourceType: 'UserSubscription',
        result: 'DENIED',
        reasonCode: 'INVALID_REQUEST',
      },
    });
    usersResult('INVALID_REQUEST');
  }

  let result = 'SUBSCRIPTION_CANCELLED';
  try {
    const cancelled = await cancelUserSubscription(parsed.data.userId, parsed.data.subscriptionId);
    result = cancelled ? 'SUBSCRIPTION_CANCELLED' : 'SUBSCRIPTION_DENIED';
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_CANCEL',
        resourceType: 'UserSubscription',
        resourceId: parsed.data.subscriptionId,
        targetUserId: parsed.data.userId,
        result: cancelled ? 'SUCCESS' : 'DENIED',
        reasonCode: cancelled ? undefined : 'SUBSCRIPTION_DENIED',
      },
    });
  } catch {
    result = 'REQUEST_FAILED';
  }

  revalidatePath('/admin/users');
  revalidatePath('/orders');
  usersResult(result);
}
