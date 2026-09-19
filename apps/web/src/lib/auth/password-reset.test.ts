import { describe, expect, it, vi } from 'vitest';
import { InvalidPasswordResetTokenError, resetPasswordWithToken } from './password-reset';
import { hashRecoveryToken } from './recovery-token';

function createPrismaDouble(consumedCount = 1) {
  const transaction = {
    verificationToken: {
      deleteMany: vi
        .fn()
        .mockResolvedValueOnce({ count: consumedCount })
        .mockResolvedValue({ count: 1 }),
    },
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    verificationToken: {
      findUnique: vi.fn().mockResolvedValue({
        identifier: 'player@example.com',
        expires: new Date(Date.now() + 60_000),
      }),
    },
    $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<void>) =>
      callback(transaction),
    ),
  };
  return { prisma, transaction };
}

describe('password reset consumption', () => {
  it('hashes the raw token, updates the password, and deletes all recovery tokens', async () => {
    const { prisma, transaction } = createPrismaDouble();

    await resetPasswordWithToken('raw-token', 'StrongPass123', prisma as never);

    expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({
      where: { token: hashRecoveryToken('raw-token') },
      select: { identifier: true, expires: true },
    });
    expect(transaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'player@example.com', status: { not: 'DELETED' } },
      }),
    );
    expect(transaction.verificationToken.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('rejects a token that another request has already consumed', async () => {
    const { prisma } = createPrismaDouble(0);

    await expect(
      resetPasswordWithToken('already-used', 'StrongPass123', prisma as never),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });
});
