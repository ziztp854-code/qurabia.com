import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { QuoteMasterJoin } from '@/components/special-games/quote-master-join';
import { getCurrentSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'انضمام إلى «من القائل؟» | تحدّي',
  description: 'ادخل غرفة «من القائل؟» بمسح الباركود أو رمز الغرفة، وأدخل اسمك للمشاركة.',
};

export default async function QuoteMasterJoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getCurrentSession().catch(() => null);

  return (
    <SiteLayout user={session?.user ? { name: session.user.name } : null}>
      <QuoteMasterJoin roomCode={(code ?? '').toUpperCase().slice(0, 6)} />
    </SiteLayout>
  );
}
