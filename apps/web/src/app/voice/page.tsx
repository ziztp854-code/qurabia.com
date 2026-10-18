import type { Metadata } from 'next';
import { getCurrentSession } from '@/lib/auth/session';
import type { VoiceView } from '@/components/voice/voice-ui';
import { VoiceLobby } from '@/components/voice/voice-lobby';

export const metadata: Metadata = {
  title: 'تحدي لايف | غرف صوتية حيّة',
  description: 'هويتنا عربية.. صوت يجمعنا. أنشئ غرفتك الصوتية وشارك اللقاء مع مجتمع تحدي.',
};
export const dynamic = 'force-dynamic';
export default async function VoicePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getCurrentSession();
  const account = session?.user;
  const requestedView = (await searchParams).view || 'explore';
  const initialView: VoiceView = [
    'explore',
    'mine',
    'favorites',
    'following',
    'history',
    'settings',
  ].includes(requestedView)
    ? (requestedView as VoiceView)
    : 'explore';
  return (
    <VoiceLobby
      initialView={initialView}
      user={
        account?.id
          ? { id: account.id, name: account.name || 'مستخدم تحدي', image: account.image || null }
          : null
      }
    />
  );
}
