import {
  assertVoiceOrigin,
  readVoiceBody,
  voiceFailure,
  voiceIdentity,
  voiceSuccess,
} from '@/lib/community-voice/http';
import { createVoiceRoomSchema } from '@/lib/community-voice/schema';
import { createVoiceRoom, listVoiceRooms } from '@/lib/community-voice/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return voiceSuccess({ rooms: await listVoiceRooms(await voiceIdentity()) });
  } catch (error) {
    return voiceFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertVoiceOrigin(request);
    const identity = await voiceIdentity();
    const input = createVoiceRoomSchema.parse(await readVoiceBody(request));
    return voiceSuccess(await createVoiceRoom(identity, input), 201);
  } catch (error) {
    return voiceFailure(error);
  }
}
