import { CommunityError, requireCommunityActor } from '@/lib/community/service';
import { assertCommunityOrigin, communityResponse } from '@/lib/community/http';
import { validRaster } from '@/lib/community/validation';
import { checkRateLimit } from '@/lib/auth/rate-limit';
export async function POST(request: Request) {
  return communityResponse(async () => {
    assertCommunityOrigin(request);
    const actor = await requireCommunityActor(true);
    if (!(await checkRateLimit(`community-upload:${actor.id}`, 10, 60000)))
      throw new CommunityError('RATE_LIMITED', 429);
    const mime = request.headers.get('content-type');
    const type = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : null;
    if (!type) throw new CommunityError('RASTER_IMAGE_REQUIRED', 415);
    const reader = request.body?.getReader();
    if (!reader) throw new CommunityError('INVALID_IMAGE');
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100000) {
        await reader.cancel();
        throw new CommunityError('IMAGE_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (!validRaster(bytes, type)) throw new CommunityError('INVALID_IMAGE');
    return { assetUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  });
}
