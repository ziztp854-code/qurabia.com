import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { requireActiveUser } from '@/lib/auth/session';
import { GameClient } from '@/components/alfazaa/game-client';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'الفزعة | تحدي',
  description: 'ابنِ مدينتك، ادمج جيشك، واستكشف 65 ساحة تدريب للأبراج في الفزعة.',
};
export default async function AlfazaaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const demo = query?.demo === '1';
  const user = demo ? null : await requireActiveUser('/games/alfazaa');
  return (
    <SiteLayout user={user ? { name: user.name, role: user.role } : null}>
      <GameClient demo={demo} />
    </SiteLayout>
  );
}
