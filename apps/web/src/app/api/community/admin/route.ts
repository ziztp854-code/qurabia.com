import { adminCommunityCommand, getAdminCommunityData } from '@/lib/community/service';
import { communityResponse, readCommunityJson } from '@/lib/community/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return communityResponse(() => getAdminCommunityData());
}
export async function POST(request: Request) {
  return communityResponse(async () => adminCommunityCommand(await readCommunityJson(request)));
}
