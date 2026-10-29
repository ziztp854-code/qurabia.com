import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { SpecialGameRoom } from '@/components/special-games/special-game-room';
import { getCurrentSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'من القائل؟ | تحدّي', description: 'تحدٍّ جماعي في الشعر العربي.' };
export default async function QuoteMasterPage({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  const [query, session] = await Promise.all([searchParams, getCurrentSession()]);
  return <SiteLayout user={session?.user ? { name: session.user.name } : null}><SpecialGameRoom mode="quote-master" initialPin={query.join?.replace(/\D/g, '').slice(0, 6) ?? ''} /></SiteLayout>;
}
