import { getMyCommunityProfile, updateMyCommunityProfile } from '@/lib/community/service';
import { communityResponse, readCommunityJson } from '@/lib/community/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return communityResponse(() => getMyCommunityProfile());
}
export async function PATCH(request: Request) {
  return communityResponse(async () => updateMyCommunityProfile(await readCommunityJson(request)));
}
