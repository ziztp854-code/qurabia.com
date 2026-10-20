import { CommunityError, getCommunityRaster } from '@/lib/community/service';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await params;
    const asset = await getCommunityRaster(kind, id);
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        'Content-Type': asset.mime,
        'Content-Length': String(asset.bytes.length),
        'X-Content-Type-Options': 'nosniff',
        ...(asset.privateAsset ? { Vary: 'Cookie' } : {}),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': asset.privateAsset ? 'private, no-store' : 'public, max-age=300',
      },
    });
  } catch (error) {
    return new Response(null, { status: error instanceof CommunityError ? error.status : 503 });
  }
}
