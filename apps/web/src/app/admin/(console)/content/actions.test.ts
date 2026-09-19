import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getPrismaClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requirePermission: mocks.requirePermission,
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: mocks.getPrismaClient,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { updateContentStatus } from './actions';

function questionForm(nextStatus: 'PUBLISHED' | 'ARCHIVED' = 'ARCHIVED') {
  const formData = new FormData();
  formData.set('resourceType', 'Question');
  formData.set('resourceId', 'question-1');
  formData.set('nextStatus', nextStatus);
  return formData;
}

describe('question content status authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('rejects content editors before opening a transaction', async () => {
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const transaction = vi.fn();
    mocks.requirePermission.mockResolvedValue({
      id: 'editor-1',
      role: 'CONTENT_EDITOR',
      tokenVersion: 1,
    });
    mocks.getPrismaClient.mockReturnValue({
      auditLog: { create: auditCreate },
      $transaction: transaction,
    });

    await expect(updateContentStatus(questionForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(transaction).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'editor-1',
        resourceType: 'Question',
        result: 'DENIED',
        reasonCode: 'INSUFFICIENT_PERMISSION',
      }),
    });
  });

  it('rechecks the current role inside the transaction', async () => {
    const transactionAuditCreate = vi.fn().mockResolvedValue({ id: 'audit-2' });
    const questionFindUnique = vi.fn();
    const transactionClient = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          role: 'CONTENT_EDITOR',
          status: 'ACTIVE',
          tokenVersion: 1,
        }),
      },
      auditLog: { create: transactionAuditCreate },
      question: { findUnique: questionFindUnique },
    };
    mocks.requirePermission.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    mocks.getPrismaClient.mockReturnValue({
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    });

    await expect(updateContentStatus(questionForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(questionFindUnique).not.toHaveBeenCalled();
    expect(transactionAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        resourceType: 'Question',
        result: 'DENIED',
        reasonCode: 'SESSION_REVOKED',
      }),
    });
  });

  it.each(['ADMIN', 'OWNER'])('allows %s to reach the transaction', async (role) => {
    const transaction = vi.fn().mockResolvedValue('UPDATED');
    mocks.requirePermission.mockResolvedValue({
      id: `${role.toLowerCase()}-1`,
      role,
      tokenVersion: 1,
    });
    mocks.getPrismaClient.mockReturnValue({ $transaction: transaction });

    await expect(updateContentStatus(questionForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
