import { getPrismaClient } from '@/lib/auth/prisma';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const profile = await getPrismaClient().profile.findFirst({
    where: { userId, user: { status: 'ACTIVE' } },
    select: { avatarContent: true },
  });
  if (!profile?.avatarContent) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(profile.avatarContent), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(profile.avatarContent.length),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
