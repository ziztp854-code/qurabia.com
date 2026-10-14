import type { Metadata } from 'next';
import { FastestButtonRoom } from '@/components/games/fastest-button/fastest-button-room';
import { requireActiveUser } from '@/lib/auth/session';
import { createHostFastestButtonAccessToken } from '@/lib/fastest-button/host-access-token';
export const metadata: Metadata = {
  title: 'مضيف أسرع كبسة زر | تحدي',
  robots: { index: false, follow: false },
};
export default async function FastestButtonHostPage() {
  const user = await requireActiveUser('/games/fastest-button/host');
  return (
    <FastestButtonRoom
      role="host"
      hostId={user.id}
      hostName={user.name ?? 'المضيف'}
      hostToken={createHostFastestButtonAccessToken(user.id)}
    />
  );
}
