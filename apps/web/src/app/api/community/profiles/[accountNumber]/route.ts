import { CommunityError, getPublicProfile } from '@/lib/community/service';
import { communityResponse, parseAccountNumber } from '@/lib/community/http';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountNumber: string }> },
) {
  return communityResponse(async () => {
    const { accountNumber } = await params;
    const profile = await getPublicProfile(parseAccountNumber(accountNumber));
    if (!profile) throw new CommunityError('NOT_FOUND', 404);
    return profile;
  });
}
