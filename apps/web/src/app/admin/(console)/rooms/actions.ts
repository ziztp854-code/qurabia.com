'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hasPermission } from '@/lib/auth/authorization';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';

const finishRoomSchema = z.object({
  sessionId: z.string().trim().min(1).max(191),
});

export async function finishManagedRoom(formData: FormData) {
  const actor = await requirePermission('MANAGE_ROOMS', '/admin/rooms');
  const parsed = finishRoomSchema.safeParse({ sessionId: formData.get('sessionId') });
  if (!parsed.success) {
    await getPrismaClient().auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'LIVE_ROOM_FINISH',
        resourceType: 'LiveSession',
        result: 'DENIED',
        reasonCode: 'INVALID_REQUEST',
      },
    });
    redirect('/admin/rooms?result=INVALID_REQUEST');
  }

  const prisma = getPrismaClient();
  let result = 'FINISHED';
  try {
    result = await prisma.$transaction(
      async (transaction) => {
        const currentActor = await transaction.user.findUnique({
          where: { id: actor.id },
          select: { role: true, status: true, tokenVersion: true },
        });
        if (
          currentActor?.status !== 'ACTIVE' ||
          currentActor.tokenVersion !== actor.tokenVersion ||
          !hasPermission(currentActor.role, 'MANAGE_ROOMS')
        ) {
          await transaction.auditLog.create({
            data: {
              actorId: currentActor ? actor.id : null,
              actorRole: currentActor?.role ?? actor.role,
              action: 'LIVE_ROOM_FINISH',
              resourceType: 'LiveSession',
              resourceId: parsed.data.sessionId,
              result: 'DENIED',
              reasonCode: 'SESSION_REVOKED',
            },
          });
          return 'SESSION_REVOKED';
        }

        const session = await transaction.liveSession.findFirst({
          where: { id: parsed.data.sessionId, status: { in: ['WAITING', 'ACTIVE'] } },
          select: { id: true, status: true },
        });
        if (!session) {
          await transaction.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'LIVE_ROOM_FINISH',
              resourceType: 'LiveSession',
              resourceId: parsed.data.sessionId,
              result: 'DENIED',
              reasonCode: 'INVALID_REQUEST',
            },
          });
          return 'INVALID_REQUEST';
        }

        const update = await transaction.liveSession.updateMany({
          where: { id: session.id, status: session.status },
          data: { status: 'FINISHED', endedAt: new Date() },
        });
        if (update.count !== 1) {
          await transaction.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'LIVE_ROOM_FINISH',
              resourceType: 'LiveSession',
              resourceId: session.id,
              result: 'DENIED',
              reasonCode: 'STALE_ROOM',
            },
          });
          return 'STALE_ROOM';
        }

        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'LIVE_ROOM_FINISH',
            resourceType: 'LiveSession',
            resourceId: session.id,
            result: 'SUCCESS',
            before: { status: session.status },
            after: { status: 'FINISHED' },
          },
        });
        return 'FINISHED';
      },
      { isolationLevel: 'Serializable' },
    );
  } catch {
    result = 'REQUEST_FAILED';
  }

  revalidatePath('/admin');
  revalidatePath('/admin/rooms');
  revalidatePath('/host');
  revalidatePath('/broadcast');
  redirect(`/admin/rooms?result=${encodeURIComponent(result)}`);
}
