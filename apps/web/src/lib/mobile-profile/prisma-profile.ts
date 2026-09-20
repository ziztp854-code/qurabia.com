import { getPrismaClient } from '@/lib/auth/prisma';

type PrismaClient = ReturnType<typeof getPrismaClient>;

export function createPrismaMobileProfileLoader(prisma: PrismaClient = getPrismaClient()) {
  return async (userId: string) => {
    const user = await prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        profile: { select: { displayName: true, bio: true, avatarUrl: true } },
        _count: {
          select: {
            quizzes: true,
            questions: true,
            liveParticipations: true,
            hostedLiveSessions: true,
          },
        },
      },
    });
    return user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          profile: user.profile,
          stats: {
            quizzes: user._count.quizzes,
            questions: user._count.questions,
            participations: user._count.liveParticipations,
            hostedRooms: user._count.hostedLiveSessions,
          },
        }
      : null;
  };
}
