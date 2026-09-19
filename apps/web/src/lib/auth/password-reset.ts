import { getPrismaClient } from './prisma';
import { hashPassword } from './password';
import { hashRecoveryToken } from './recovery-token';

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super('Invalid or expired password reset token.');
    this.name = 'InvalidPasswordResetTokenError';
  }
}

type PasswordResetClient = ReturnType<typeof getPrismaClient>;

export async function resetPasswordWithToken(
  rawToken: string,
  password: string,
  prisma: PasswordResetClient = getPrismaClient(),
) {
  const token = hashRecoveryToken(rawToken);
  const record = await prisma.verificationToken.findUnique({
    where: { token },
    select: { identifier: true, expires: true },
  });

  if (!record || record.expires <= new Date()) {
    throw new InvalidPasswordResetTokenError();
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.verificationToken.deleteMany({
      where: {
        token,
        identifier: record.identifier,
        expires: { gt: new Date() },
      },
    });
    if (consumed.count !== 1) throw new InvalidPasswordResetTokenError();

    const updated = await transaction.user.updateMany({
      where: { email: record.identifier, status: { not: 'DELETED' } },
      data: { passwordHash },
    });
    if (updated.count !== 1) throw new InvalidPasswordResetTokenError();

    await transaction.verificationToken.deleteMany({
      where: { identifier: record.identifier },
    });
  });
}
