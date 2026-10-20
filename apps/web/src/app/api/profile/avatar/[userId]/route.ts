import { getPrismaClient } from '@/lib/auth/prisma';
import { CommunityError, getCommunityRaster } from '@/lib/community/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const user = await getPrismaClient().user.findUnique({
      where: { id: userId },
      select: { accountNumber: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return new Response(null, { status: 404 });
    const asset = await getCommunityRaster('avatar', String(user.accountNumber));
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        'Content-Type': asset.mime,
        'Content-Length': String(asset.bytes.length),
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch (error) {
    return new Response(null, { status: error instanceof CommunityError ? error.status : 503 });
  }
}
