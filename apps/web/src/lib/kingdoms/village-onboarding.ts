import 'server-only';
import type { DatabaseClient } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import { KingdomsHttpError } from './http';
import type { KingdomIdentity } from './repository';

export type VillageOnboardingState = {
  completed: boolean;
  completedAt: string | null;
};

function completionState(completedAt: Date | null): VillageOnboardingState {
  return { completed: completedAt !== null, completedAt: completedAt?.toISOString() ?? null };
}

export async function readVillageOnboarding(
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
): Promise<VillageOnboardingState> {
  const user = await db.user.findUnique({
    where: { id: identity.id },
    select: { status: true, tokenVersion: true, villageOnboardingCompletedAt: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
  return completionState(user.villageOnboardingCompletedAt);
}

export async function completeVillageOnboarding(
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
): Promise<VillageOnboardingState> {
  // PostgreSQL rechecks this condition after a concurrent row-lock wait. The
  // account remains the authority even if its session was revoked meanwhile.
  const [user] = await db.$queryRaw<{ villageOnboardingCompletedAt: Date }[]>`
    UPDATE "User"
    SET "villageOnboardingCompletedAt" = COALESCE("villageOnboardingCompletedAt", clock_timestamp() AT TIME ZONE 'UTC'),
        "updatedAt" = CASE WHEN "villageOnboardingCompletedAt" IS NULL
          THEN clock_timestamp() AT TIME ZONE 'UTC' ELSE "updatedAt" END
    WHERE id = ${identity.id} AND status = 'ACTIVE' AND "tokenVersion" = ${identity.tokenVersion}
    RETURNING "villageOnboardingCompletedAt"
  `;
  if (!user) throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
  return completionState(user.villageOnboardingCompletedAt);
}
