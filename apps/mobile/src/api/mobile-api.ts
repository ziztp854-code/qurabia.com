import { mobileEnvironment } from '../core/environment';
import { isLiveConnectionTicket, type LiveConnectionTicket } from '@tahaddi/contracts/client';

export type { LiveConnectionTicket } from '@tahaddi/contracts/client';

type Fetch = typeof fetch;

export type MobileRoomParticipant = {
  id: string;
  displayName: string;
  score: number;
  status: string;
};

export type MobileRoom = {
  sessionId: string;
  roomCode: string;
  status: string;
  title: string;
  maxPlayers: number;
  participants: MobileRoomParticipant[];
};

export type MobileHostQuiz = {
  id: string;
  title: string;
  roomCode: string;
  maxPlayers: number;
  questionCount: number;
  activeRoom: { sessionId: string; status: string } | null;
};

export type MobileProfile = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  rank: { code: string; name: string; tagline: string; emblem: string };
  stats: { quizzes: number; questions: number; participations: number; hostedRooms: number };
};

export class MobileApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${field}`);
  return value;
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${field}`);
  return value;
}

function parseTicket(value: unknown): LiveConnectionTicket {
  if (!isRecord(value) || (value.role !== 'host' && value.role !== 'player'))
    throw new Error('Invalid ticket');
  const ticket = {
    sessionId: requiredString(value.sessionId, 'sessionId'),
    subjectId: requiredString(value.subjectId, 'subjectId'),
    role: value.role,
    accessToken: requiredString(value.accessToken, 'accessToken'),
    expiresAt: requiredNumber(value.expiresAt, 'expiresAt'),
    ...(value.subjectVersion === undefined
      ? {}
      : { subjectVersion: requiredNumber(value.subjectVersion, 'subjectVersion') }),
  };
  if (!isLiveConnectionTicket(ticket)) throw new Error('Invalid ticket');
  return ticket;
}

function parseRoom(value: unknown): MobileRoom {
  if (!isRecord(value) || !Array.isArray(value.participants)) throw new Error('Invalid room');
  return {
    sessionId: requiredString(value.sessionId, 'sessionId'),
    roomCode: requiredString(value.roomCode, 'roomCode'),
    status: requiredString(value.status, 'status'),
    title: requiredString(value.title, 'title'),
    maxPlayers: requiredNumber(value.maxPlayers, 'maxPlayers'),
    participants: value.participants.map((participant) => {
      if (!isRecord(participant)) throw new Error('Invalid participant');
      return {
        id: requiredString(participant.id, 'participant.id'),
        displayName: requiredString(participant.displayName, 'participant.displayName'),
        score: requiredNumber(participant.score, 'participant.score'),
        status: requiredString(participant.status, 'participant.status'),
      };
    }),
  };
}

function parseQuiz(value: unknown): MobileHostQuiz {
  if (!isRecord(value)) throw new Error('Invalid quiz');
  const activeRoom = value.activeRoom;
  return {
    id: requiredString(value.id, 'quiz.id'),
    title: requiredString(value.title, 'quiz.title'),
    roomCode: requiredString(value.roomCode, 'quiz.roomCode'),
    maxPlayers: requiredNumber(value.maxPlayers, 'quiz.maxPlayers'),
    questionCount: requiredNumber(value.questionCount, 'quiz.questionCount'),
    activeRoom:
      activeRoom === null
        ? null
        : isRecord(activeRoom)
          ? {
              sessionId: requiredString(activeRoom.sessionId, 'activeRoom.sessionId'),
              status: requiredString(activeRoom.status, 'activeRoom.status'),
            }
          : (() => {
              throw new Error('Invalid active room');
            })(),
  };
}

function parseProfile(value: unknown): MobileProfile {
  if (!isRecord(value) || !isRecord(value.rank) || !isRecord(value.stats))
    throw new Error('Invalid profile');
  return {
    id: requiredString(value.id, 'profile.id'),
    displayName: requiredString(value.displayName, 'profile.displayName'),
    email: typeof value.email === 'string' ? value.email : null,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
    bio: typeof value.bio === 'string' ? value.bio : null,
    rank: {
      code: requiredString(value.rank.code, 'rank.code'),
      name: requiredString(value.rank.name, 'rank.name'),
      tagline: requiredString(value.rank.tagline, 'rank.tagline'),
      emblem: requiredString(value.rank.emblem, 'rank.emblem'),
    },
    stats: {
      quizzes: requiredNumber(value.stats.quizzes, 'stats.quizzes'),
      questions: requiredNumber(value.stats.questions, 'stats.questions'),
      participations: requiredNumber(value.stats.participations, 'stats.participations'),
      hostedRooms: requiredNumber(value.stats.hostedRooms, 'stats.hostedRooms'),
    },
  };
}

export function createMobileApi(baseUrl: string, fetchImpl: Fetch = fetch) {
  async function request(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      accessToken?: string;
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 15_000);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch {
      throw new MobileApiError(
        'NETWORK_ERROR',
        'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.',
        0,
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MobileApiError('INVALID_RESPONSE', 'وصل رد غير صالح من الخادم.', response.status);
    }
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
      throw new MobileApiError(
        typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
        typeof error?.message === 'string' ? error.message : 'تعذّر إكمال الطلب الآن.',
        response.status,
      );
    }
    return payload.data;
  }

  function parseRoomWithTicket(value: unknown) {
    if (!isRecord(value))
      throw new MobileApiError('INVALID_RESPONSE', 'وصلت بيانات غرفة غير صالحة.', 0);
    try {
      return { room: parseRoom(value.room), ticket: parseTicket(value.ticket) };
    } catch {
      throw new MobileApiError('INVALID_RESPONSE', 'وصلت بيانات غرفة غير صالحة.', 0);
    }
  }

  return {
    async listHostQuizzes(accessToken: string, signal?: AbortSignal) {
      const value = await request('/api/mobile/rooms', { accessToken, signal });
      if (!isRecord(value) || !Array.isArray(value.quizzes)) {
        throw new MobileApiError('INVALID_RESPONSE', 'وصلت قائمة مسابقات غير صالحة.', 0);
      }
      try {
        return value.quizzes.map(parseQuiz);
      } catch {
        throw new MobileApiError('INVALID_RESPONSE', 'وصلت قائمة مسابقات غير صالحة.', 0);
      }
    },
    createRoom: async (accessToken: string, quizId: string) =>
      parseRoomWithTicket(
        await request('/api/mobile/rooms', { method: 'POST', accessToken, body: { quizId } }),
      ),
    async readRoom(roomCode: string, signal?: AbortSignal) {
      try {
        return parseRoom(
          await request(`/api/mobile/rooms/${encodeURIComponent(roomCode)}`, { signal }),
        );
      } catch (error) {
        if (error instanceof MobileApiError) throw error;
        throw new MobileApiError('INVALID_RESPONSE', 'وصلت بيانات غرفة غير صالحة.', 0);
      }
    },
    joinRoom: async (roomCode: string, displayName: string, accessToken?: string) =>
      parseRoomWithTicket(
        await request(`/api/mobile/rooms/${encodeURIComponent(roomCode)}/join`, {
          method: 'POST',
          accessToken,
          body: { displayName },
        }),
      ),
    async getProfile(accessToken: string, signal?: AbortSignal) {
      try {
        return parseProfile(await request('/api/mobile/profile', { accessToken, signal }));
      } catch (error) {
        if (error instanceof MobileApiError) throw error;
        throw new MobileApiError('INVALID_RESPONSE', 'وصلت بيانات ملف شخصي غير صالحة.', 0);
      }
    },
  };
}

export const mobileApi = createMobileApi(mobileEnvironment.apiBaseUrl);
