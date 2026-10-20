import type { Metadata } from 'next';
import { optionalVoiceDisplayIdentity } from '@/lib/voice/identity';
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
  const user = await optionalVoiceDisplayIdentity();
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
  return <VoiceLobby initialView={initialView} user={user} />;
}
