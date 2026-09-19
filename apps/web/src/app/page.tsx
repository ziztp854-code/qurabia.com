import { planDefinition } from '@tahaddi/domain';
import { PrestigeHome } from '@/components/home/prestige-home';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import { getDisplayPlanCode } from '@/lib/subscription/entitlements';
import { buildPublicPageMetadata } from '@/lib/metadata/site';

export const metadata = buildPublicPageMetadata({
  path: '/',
  title: 'تحدّي | مسابقات وألعاب جماعية عربية مباشرة',
  description:
    'تحدّي منصة عربية لإنشاء المسابقات والألعاب الجماعية المباشرة. شارك رمز الغرفة، واستقبل اللاعبين، وتابع الإجابات والترتيب لحظة بلحظة.',
});

export default async function HomePage() {
  const session = await getCurrentSession();

  let rank: { code: string; name: string; emblem: string } | null = null;
  if (session?.user && hasDatabaseUrl()) {
    try {
      const plan = planDefinition(
        await getDisplayPlanCode(getPrismaClient(), session.user.id, session.user.role),
      );
      rank = { code: plan.code, name: plan.name, emblem: plan.emblem };
    } catch {
      rank = null;
    }
  }

  return (
    <PrestigeHome
      user={session?.user ? { name: session.user.name, role: session.user.role } : null}
      rank={rank}
    />
  );
}
