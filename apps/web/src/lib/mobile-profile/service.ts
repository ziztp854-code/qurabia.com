import { planDefinition, type PlanCode } from '@tahaddi/domain';

type LoadedProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  profile: { displayName: string | null; bio: string | null; avatarUrl: string | null } | null;
  stats: { quizzes: number; questions: number; participations: number; hostedRooms: number };
};

type MobileProfileDependencies = {
  loadProfile(userId: string): Promise<LoadedProfile | null>;
  resolvePlanCode(userId: string, role: string): Promise<PlanCode>;
};

export class MobileProfileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MobileProfileError';
  }
}

export function createMobileProfileService(dependencies: MobileProfileDependencies) {
  return {
    async getProfile(userId: string) {
      const user = await dependencies.loadProfile(userId);
      if (!user) {
        throw new MobileProfileError('PROFILE_NOT_FOUND', 'تعذّر تحميل الملف الشخصي.', 404);
      }
      const code = await dependencies.resolvePlanCode(user.id, user.role);
      const rank = planDefinition(code);
      return {
        id: user.id,
        displayName: user.profile?.displayName || user.name || user.email?.split('@')[0] || 'لاعب',
        email: user.email,
        avatarUrl: user.profile?.avatarUrl || user.image,
        bio: user.profile?.bio,
        rank: { code: rank.code, name: rank.name, tagline: rank.tagline, emblem: rank.emblem },
        stats: user.stats,
      };
    },
  };
}
