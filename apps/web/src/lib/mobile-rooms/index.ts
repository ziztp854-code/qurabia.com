import { getPrismaClient } from '@/lib/auth/prisma';
import {
  createHostLiveAccessCredential,
  createPlayerLiveAccessCredential,
} from '@/lib/live/access-token';
import {
  consumeQuota,
  getActivePlanCode,
  limitFor,
  planBypassesLimits,
  refundQuota,
} from '@/lib/subscription/entitlements';
import { createPrismaMobileRoomsRepository } from './prisma-repository';
import { createMobileRoomsService } from './service';

export function createDefaultMobileRoomsService() {
  const prisma = getPrismaClient();
  return createMobileRoomsService({
    repository: createPrismaMobileRoomsRepository(prisma),
    resolvePlan: async (userId, role) => {
      const code = await getActivePlanCode(prisma, userId);
      return {
        code,
        maxRoomPlayers: limitFor(code, 'maxRoomPlayers'),
        bypassesLimits: planBypassesLimits(role),
      };
    },
    consumeRoomQuota: async (userId, role) => {
      const quota = await consumeQuota(userId, 'maxLiveRoomsPerMonth', role);
      return quota.ok
        ? { ok: true, unlimited: quota.unlimited }
        : { ok: false, message: quota.message };
    },
    refundRoomQuota: (userId) => refundQuota(userId, 'maxLiveRoomsPerMonth'),
    createHostCredential: createHostLiveAccessCredential,
    createPlayerCredential: createPlayerLiveAccessCredential,
  });
}

export { MobileRoomsError } from './service';
export type { MobileHostQuiz, MobileRoom } from './service';
export type { LiveConnectionTicket } from '@tahaddi/contracts';
