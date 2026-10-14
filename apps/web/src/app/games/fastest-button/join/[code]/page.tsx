import { notFound } from 'next/navigation';
import { FastestButtonRoom } from '@/components/games/fastest-button/fastest-button-room';
export default async function FastestButtonJoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound();
  return <FastestButtonRoom role="player" initialCode={code} />;
}
