import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { ScrambledWordsRoom } from '@/components/games/scrambled-words-live/scrambled-words-room';
import { requireActiveUser } from '@/lib/auth/session';
import { createHostScrambledWordsAccessToken } from '@/lib/scrambled-words/host-access-token';

export const metadata: Metadata = {
  title: 'بوابة مضيف كلمات مفككة | تحدي',
  description: 'مسار محمي لإنشاء غرفة كلمات مفككة المباشرة وإدارتها.',
};

export default async function ScrambledWordsLiveHostPage() {
  const user = await requireActiveUser('/games/scrambled-words-live/host');

  return (
    <SiteLayout user={{ name: user.name, role: user.role }}>
      <ScrambledWordsRoom
        role="host"
        hostIdentity={{
          hostId: user.id,
          accessToken: createHostScrambledWordsAccessToken(user.id),
        }}
        hostName={user.name ?? 'المضيف'}
      />
    </SiteLayout>
  );
}
