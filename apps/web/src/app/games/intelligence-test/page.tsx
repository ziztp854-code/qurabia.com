import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { IntelligenceTest } from '@/components/intelligence-test/intelligence-test';
import { getCurrentSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'تحدي الذكاء | تحدّي',
  description:
    'لعبة عربية من 18 سؤالًا في المنطق والأعداد والأنماط بثلاثة مستويات وتقرير قابل للطباعة والحفظ بصيغة PDF. تقييم ترفيهي غير معياري.',
  alternates: { canonical: '/games/intelligence-test/' },
};

export default async function IntelligenceTestPage() {
  const session = await getCurrentSession();
  return (
    <SiteLayout user={session?.user ? { name: session.user.name } : null}>
      <IntelligenceTest />
    </SiteLayout>
  );
}
