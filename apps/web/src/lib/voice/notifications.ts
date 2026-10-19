import 'server-only';
import { after } from 'next/server';
import { notifyVoiceRoomChanged } from './livekit';
import type { VoiceSnapshot } from './types';
export function announceVoiceChange(snapshot: VoiceSnapshot, messageId?: string) {
  after(() => notifyVoiceRoomChanged(snapshot.room.id, snapshot.cursor, messageId));
  return snapshot;
}
