'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  areQuizQuestionsPlayable,
  canManageContentResource,
} from '@/lib/admin/content-policy';
import { hasPermission } from '@/lib/auth/authorization';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';

const contentActionSchema = z.discriminatedUnion('resourceType', [
  z.object({
    resourceType: z.literal('Question'),
    resourceId: z.string().trim().min(1).max(191),
    nextStatus: z.enum(['PUBLISHED', 'ARCHIVED']),
  }),
  z.object({
    resourceType: z.literal('Quiz'),
    resourceId: z.string().trim().min(1).max(191),
    nextStatus: z.enum(['ACTIVE', 'ARCHIVED']),
  }),
]);

function contentResult(code: string): never {
  redirect(`/admin/content?result=${encodeURIComponent(code)}`);
}

export async function updateContentStatus(formData: FormData) {
  const actor = await requirePermission('MANAGE_CONTENT', '/admin/content');
  const parsed = contentActionSchema.safeParse({
    resourceType: formData.get('resourceType'),
    resourceId: formData.get('resourceId'),
    nextStatus: formData.get('nextStatus'),
  });
  if (!parsed.success) {
    await getPrismaClient().auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'CONTENT_STATUS_UPDATE',
        resourceType: 'Content',
        result: 'DENIED',
        reasonCode: 'INVALID_REQUEST',
      },
    });
    contentResult('INVALID_REQUEST');
  }

  if (!canManageContentResource(actor.role, parsed.data.resourceType)) {
    await getPrismaClient().auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'CONTENT_STATUS_UPDATE',
        resourceType: parsed.data.resourceType,
        resourceId: parsed.data.resourceId,
        result: 'DENIED',
        reasonCode: 'INSUFFICIENT_PERMISSION',
      },
    });
    contentResult('INSUFFICIENT_PERMISSION');
  }

  const publishes = parsed.data.nextStatus === 'PUBLISHED' || parsed.data.nextStatus === 'ACTIVE';
  if (publishes) {
    await requirePermission('PUBLISH_CONTENT', '/admin/content');
  }
  const prisma = getPrismaClient();
  let result = 'UPDATED';

  try {
    result = await prisma.$transaction(
      async (transaction) => {
        const currentActor = await transaction.user.findUnique({
          where: { id: actor.id },
          select: { role: true, status: true, tokenVersion: true },
        });
        const requiredPermission = publishes ? 'PUBLISH_CONTENT' : 'MANAGE_CONTENT';
        if (
          currentActor?.status !== 'ACTIVE' ||
          currentActor.tokenVersion !== actor.tokenVersion ||
          !hasPermission(currentActor.role, requiredPermission) ||
          !canManageContentResource(currentActor.role, parsed.data.resourceType)
        ) {
          await transaction.auditLog.create({
            data: {
              actorId: currentActor ? actor.id : null,
              actorRole: currentActor?.role ?? actor.role,
              action: 'CONTENT_STATUS_UPDATE',
              resourceType: parsed.data.resourceType,
              resourceId: parsed.data.resourceId,
              result: 'DENIED',
              reasonCode: 'SESSION_REVOKED',
            },
          });
          return 'SESSION_REVOKED';
        }

        if (parsed.data.resourceType === 'Question') {
          const question = await transaction.question.findUnique({
            where: { id: parsed.data.resourceId },
            select: {
              id: true,
              status: true,
              _count: { select: { options: true } },
            },
          });
          if (!question) {
            await transaction.auditLog.create({
              data: {
                actorId: actor.id,
                actorRole: actor.role,
                action: 'CONTENT_STATUS_UPDATE',
                resourceType: 'Question',
                resourceId: parsed.data.resourceId,
                result: 'DENIED',
                reasonCode: 'INVALID_REQUEST',
              },
            });
            return 'INVALID_REQUEST';
          }
          const correctOptionCount = await transaction.questionOption.count({
            where: { questionId: question.id, isCorrect: true },
          });
          if (
            parsed.data.nextStatus === 'PUBLISHED' &&
            (question._count.options < 2 || correctOptionCount !== 1)
          ) {
            await transaction.auditLog.create({
              data: {
                actorId: actor.id,
                actorRole: actor.role,
                action: 'CONTENT_STATUS_UPDATE',
                resourceType: 'Question',
                resourceId: question.id,
                result: 'DENIED',
                reasonCode: 'CONTENT_INCOMPLETE',
              },
            });
            return 'CONTENT_INCOMPLETE';
          }

          await transaction.question.update({
            where: { id: question.id },
            data: {
              status: parsed.data.nextStatus,
              archivedAt: parsed.data.nextStatus === 'ARCHIVED' ? new Date() : null,
              // Status changes are part of a question's editing history;
              // bank ordering sorts by lastEditedAt, so keep it in sync.
              lastEditedAt: new Date(),
            },
          });
          const affectedQuizzes =
            parsed.data.nextStatus === 'ARCHIVED'
              ? await transaction.quiz.findMany({
                  where: {
                    status: 'ACTIVE',
                    questions: { some: { questionId: question.id } },
                  },
                  select: { id: true },
                })
              : [];
          const affectedQuizIds = affectedQuizzes.map((quiz) => quiz.id);
          const deactivatedQuizzes = affectedQuizIds.length
            ? await transaction.quiz.updateMany({
                where: { id: { in: affectedQuizIds }, status: 'ACTIVE' },
                data: { status: 'DRAFT', isPublic: false },
              })
            : { count: 0 };
          const endedSessions = affectedQuizIds.length
            ? await transaction.liveSession.updateMany({
                where: {
                  quizId: { in: affectedQuizIds },
                  status: { in: ['WAITING', 'ACTIVE'] },
                },
                data: { status: 'FINISHED', endedAt: new Date() },
              })
            : { count: 0 };
          await transaction.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'CONTENT_STATUS_UPDATE',
              resourceType: 'Question',
              resourceId: question.id,
              result: 'SUCCESS',
              before: { status: question.status },
              after: {
                status: parsed.data.nextStatus,
                deactivatedQuizzes: deactivatedQuizzes.count,
                endedSessions: endedSessions.count,
              },
            },
          });
          return 'UPDATED';
        }

        const quiz = await transaction.quiz.findUnique({
          where: { id: parsed.data.resourceId },
          select: {
            id: true,
            status: true,
            questions: { select: { questionId: true } },
          },
        });
        if (!quiz) {
          await transaction.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'CONTENT_STATUS_UPDATE',
              resourceType: 'Quiz',
              resourceId: parsed.data.resourceId,
              result: 'DENIED',
              reasonCode: 'INVALID_REQUEST',
            },
          });
          return 'INVALID_REQUEST';
        }
        if (parsed.data.nextStatus === 'ACTIVE') {
          const questionIds = quiz.questions.map((question) => question.questionId);
          const playableQuestions = await transaction.question.findMany({
            where: { id: { in: questionIds } },
            select: {
              id: true,
              status: true,
              _count: { select: { options: true } },
              options: { where: { isCorrect: true }, select: { id: true } },
            },
          });
          const allQuestionsPlayable =
            playableQuestions.length === questionIds.length &&
            areQuizQuestionsPlayable(
              playableQuestions.map((question) => ({
                status: question.status,
                optionCount: question._count.options,
                correctOptionCount: question.options.length,
              })),
            );
          if (!allQuestionsPlayable) {
            await transaction.auditLog.create({
              data: {
                actorId: actor.id,
                actorRole: actor.role,
                action: 'CONTENT_STATUS_UPDATE',
                resourceType: 'Quiz',
                resourceId: quiz.id,
                result: 'DENIED',
                reasonCode: 'CONTENT_INCOMPLETE',
              },
            });
            return 'CONTENT_INCOMPLETE';
          }
        }

        await transaction.quiz.update({
          where: { id: quiz.id },
          data: {
            status: parsed.data.nextStatus,
            isPublic: parsed.data.nextStatus === 'ACTIVE',
          },
        });
        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'CONTENT_STATUS_UPDATE',
            resourceType: 'Quiz',
            resourceId: quiz.id,
            result: 'SUCCESS',
            before: { status: quiz.status },
            after: { status: parsed.data.nextStatus },
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
  revalidatePath('/admin/content');
  revalidatePath('/quizzes');
  revalidatePath('/');
  contentResult(result);
}
