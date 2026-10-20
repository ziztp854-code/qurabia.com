import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin, readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createRoomSchema } from '@/lib/voice/schemas';
import { createVoiceRoom, listVoiceRooms } from '@/lib/voice/repository';
export async function GET() {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false, 'rooms');
    return jsonSuccess(await listVoiceRooms(user.id));
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true, 'create');
    const input = await readVoiceBody(request, createRoomSchema);
    return jsonSuccess(await createVoiceRoom(user, input), 201);
  } catch (error) {
    return jsonFailure(error);
  }
}
