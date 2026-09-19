import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { KnowledgeTowerRoom } from '@/components/special-games';
import { getCurrentSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'برج المعرفة | تحدّي',
  description:
    'اصعد اثني عشر طابقاً من الأسئلة العربية المتدرجة، بثلاث أرواح ومحطات أمان ووقت يتسارع مع كل ارتفاع.',
};

export default async function KnowledgeTowerPage() {
  const session = await getCurrentSession();

  return (
    <SiteLayout user={session?.user ? { name: session.user.name } : null}>
      <KnowledgeTowerRoom />
    </SiteLayout>
  );
}
