import { ApiError, type ApiClient } from '../auth/http-client';
import { joinEndpoint, OFFLINE_MESSAGE, parseJoinResponse, parseRoomResponse,
  roomEndpoint, roomRequestBody, type PlayerIdentity, type RoomOperation } from './live-room';

const JOIN_FAILURES: Record<number, string> = {
  400: 'تحقق من رمز الغرفة واسم اللاعب.', 404: 'لم نجد مسابقة مفتوحة بهذا الرمز.',
  409: 'اكتملت الغرفة أو استُخدم هذا الاسم. اختر اسمًا آخر ثم تحقق من الغرفة.',
  429: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.',
};
export function createQuizApi(request: ApiClient['request']) {
async function requestJoin(roomCode: string, playerName: string) {
  try {
    const body = await request<unknown>(joinEndpoint(), {
      method: 'POST', body: { roomCode, playerName }, timeoutMs: 10_000,
    });
    return parseJoinResponse(200, body);
  } catch (error) {
    return { ok: false as const, fatal: false,
      message: error instanceof ApiError ? JOIN_FAILURES[error.status] || OFFLINE_MESSAGE : OFFLINE_MESSAGE };
  }
}
async function postRoom(identity: PlayerIdentity, operation: RoomOperation,
  answer?: { questionId: string; optionId: string }, signal?: AbortSignal) {
  const sentAt = Date.now();
  try {
    const body = await request<unknown>(roomEndpoint(identity.sessionId), {
      method: 'POST', body: roomRequestBody(identity, operation, answer), timeoutMs: 8_000, signal,
    });
    return { result: parseRoomResponse(200, body), sentAt, receivedAt: Date.now() };
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    return { result: parseRoomResponse(status, null), sentAt, receivedAt: Date.now() };
  }
}
  return { requestJoin, postRoom };
}
