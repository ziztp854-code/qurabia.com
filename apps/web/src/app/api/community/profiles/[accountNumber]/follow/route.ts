import { followProfile } from '@/lib/community/service';
import { assertCommunityOrigin, communityResponse, parseAccountNumber } from '@/lib/community/http';
type Context = { params: Promise<{ accountNumber: string }> };
export async function POST(request: Request, { params }: Context) {
  return communityResponse(async () => {
    assertCommunityOrigin(request);
    return followProfile(parseAccountNumber((await params).accountNumber), true);
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return communityResponse(async () => {
    assertCommunityOrigin(request);
    return followProfile(parseAccountNumber((await params).accountNumber), false);
  });
}
