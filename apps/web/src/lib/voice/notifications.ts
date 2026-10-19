import 'server-only';
import { after } from 'next/server';
import { notifyVoiceRoomChanged } from './livekit';
import type { VoiceSnapshot } from './types';
export function announceVoiceChange(snapshot: VoiceSnapshot) {
  after(() => notifyVoiceRoomChanged(snapshot.room.id, snapshot.cursor));
  return snapshot;
}
