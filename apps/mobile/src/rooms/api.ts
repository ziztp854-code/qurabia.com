import type { ApiClient } from '../api/client';
import type {
  VoiceCreateInput, VoiceEvent, VoiceJoinInput, VoiceLeaveResult,
  VoiceList, VoiceSnapshot, VoiceUpdateInput,
} from '../api/contracts';

export type ApiRequest = ApiClient['request'];

export function roomPath(roomId: string): string {
  if (!roomId || roomId.length > 160) throw new Error('معرّف الغرفة غير صالح.');
  return '/api/voice/rooms/' + encodeURIComponent(roomId);
}

/** Writes are never retried here: a timed-out request may have already committed. */
export function createRoomsApi(request: ApiRequest) {
  return {
    list: (signal?: AbortSignal) =>
      request<VoiceList>('/api/voice/rooms', { signal, timeoutMs: 10_000 }),
    create: (input: VoiceCreateInput) =>
      request<VoiceSnapshot>('/api/voice/rooms', {
        method: 'POST', body: input, timeoutMs: 45_000,
      }),
    snapshot: (roomId: string, signal?: AbortSignal) =>
      request<VoiceSnapshot>(roomPath(roomId), { signal, timeoutMs: 10_000 }),
    // The events GET explicitly renews existing membership; the room GET does not.
    heartbeat: (roomId: string, signal?: AbortSignal) =>
      request<VoiceSnapshot>(roomPath(roomId) + '/events', { signal, timeoutMs: 15_000 }),
    join: (roomId: string, input: VoiceJoinInput = {}) =>
      request<VoiceSnapshot>(roomPath(roomId) + '/join', {
        method: 'POST', body: input, timeoutMs: 45_000,
      }),
    leave: (roomId: string) =>
      request<VoiceLeaveResult>(roomPath(roomId) + '/leave', {
        method: 'POST', body: {}, timeoutMs: 45_000,
      }),
    send: (roomId: string, event: VoiceEvent) =>
      request<VoiceSnapshot>(roomPath(roomId) + '/events', {
        method: 'POST', body: event, timeoutMs: 45_000,
      }),
    update: (roomId: string, input: VoiceUpdateInput) =>
      request<VoiceSnapshot>(roomPath(roomId), {
        method: 'PATCH', body: input, timeoutMs: 45_000,
      }),
  };
}
