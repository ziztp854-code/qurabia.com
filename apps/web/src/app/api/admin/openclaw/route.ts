import { decisionSchema, failure, readBody } from '@/lib/openclaw-admin/protocol';
import {
  decideProposal,
  listProposals,
  requireOwner,
  sameOrigin,
} from '@/lib/openclaw-admin/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireOwner(request);
    return Response.json(
      { ok: true, proposals: await listProposals() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireOwner(request);
    await decideProposal(decisionSchema.parse(await readBody(request)), actor);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
