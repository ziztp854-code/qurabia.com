import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FastestButtonRoom } from '@/components/games/fastest-button/fastest-button-room';
export const metadata: Metadata = {
  title: 'بث أسرع كبسة زر | تحدي',
  robots: { index: false, follow: false },
};
export default async function FastestButtonDisplayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound();
  return <FastestButtonRoom role="display" initialCode={code} />;
}
