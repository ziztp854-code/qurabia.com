import { redirect } from 'next/navigation';
export default async function QuoteMasterJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/games/quote-master?join=${encodeURIComponent(code.replace(/\D/g, '').slice(0, 6))}`);
}
