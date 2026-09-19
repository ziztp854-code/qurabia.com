import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { GameCatalogWrapper } from '@/components/game-catalog';
import { publicGames, toCatalogGames } from '@/data/games';
import { getCurrentSession } from '@/lib/auth/session';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { hasPlanFlag } from '@/lib/subscription/entitlements';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'الألعاب | تحدّي',
  description: 'كتالوج ألعاب عربية جماعية وفورية مع بحث حسب الاسم والتصنيف وسعة اللاعبين.',
  alternates: { canonical: '/games' },
  openGraph: {
    title: 'الألعاب | تحدّي · كتالوج متقدم',
    description: 'اكتشف غرف البث اللحظي والتحديات الفورية في كتالوج عربي واضح ومتوافق مع الوصولية.',
    locale: 'ar_SA',
    type: 'website',
    url: '/games',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'الألعاب | تحدّي',
    description: 'كتالوج ألعاب عربية جماعية وفورية مع بحث وفلترة واضحة.',
  },
};

export default async function GamesPage() {
  const session = await getCurrentSession().catch(() => null);
  const userName = session?.user?.name ?? null;
  let earlyAccess = false;
  if (session?.user && hasDatabaseUrl()) {
    earlyAccess = await hasPlanFlag(
      getPrismaClient(),
      session.user.id,
      'earlyAccessGames',
      session.user.role,
    );
  }
  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      <GameCatalogWrapper
        sessionUserName={userName}
        initialGames={toCatalogGames(publicGames)}
        earlyAccess={earlyAccess}
      />
    </SiteLayout>
  );
}
