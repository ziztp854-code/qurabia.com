import { getPrismaClient } from '@/lib/auth/prisma';
import { getDisplayPlanCode } from '@/lib/subscription/entitlements';
import { createPrismaMobileProfileLoader } from './prisma-profile';
import { MobileProfileError, createMobileProfileService } from './service';

export function createDefaultMobileProfileService() {
  const prisma = getPrismaClient();
  return createMobileProfileService({
    loadProfile: createPrismaMobileProfileLoader(prisma),
    resolvePlanCode: (userId, role) => getDisplayPlanCode(prisma, userId, role),
  });
}

export { MobileProfileError };
