import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteLayout } from '@/components/layout';
import { InstantGameRoom } from '@/components/instant-games';
import { getCurrentSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'انضمام إلى البلوت | تحدّي',
  description: 'انضم إلى مجلس البلوت برمز الغرفة.',
};

export default async function BalootJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, session] = await Promise.all([params, getCurrentSession().catch(() => null)]);
  if (!/^\d{6}$/.test(code)) notFound();
  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      <InstantGameRoom mode="baloot" initialCode={code} />
    </SiteLayout>
  );
}
