import {
  assertVoiceOrigin,
  readVoiceBody,
  voiceFailure,
  voiceIdentity,
  voiceSuccess,
} from '@/lib/voice/http';
import { roomIdSchema, voiceCommandSchema } from '@/lib/voice/schema';
import { commandVoiceRoom } from '@/lib/voice/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    assertVoiceOrigin(request);
    const identity = await voiceIdentity();
    const roomId = roomIdSchema.parse((await params).roomId);
    const command = voiceCommandSchema.parse(await readVoiceBody(request));
    return voiceSuccess(await commandVoiceRoom(roomId, identity, command));
  } catch (error) {
    return voiceFailure(error);
  }
}
