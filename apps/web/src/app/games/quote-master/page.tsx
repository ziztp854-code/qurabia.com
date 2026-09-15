import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { QuoteMasterRoom } from '@/components/special-games';
import { getCurrentSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'من القائل؟ | تحدّي',
  description:
    'تحدٍّ أدبي فوري: يظهر بيت شعر أو حكمة خالدة وأمامك أربعة أسماء من عمالقة الأدب العربي، اكتشف صاحب القول وابنِ سلسلة إجابات لتضاعف نقاطك.',
};

export default async function QuoteMasterPage() {
  const session = await getCurrentSession();

  return (
    <SiteLayout user={session?.user ? { name: session.user.name } : null}>
      <QuoteMasterRoom />
    </SiteLayout>
  );
}
