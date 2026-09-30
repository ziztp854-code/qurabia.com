import type {
  AnswerRejectionReason,
  GamePhase,
  GameSnapshot,
  PlayerInfo,
  QuestionPayload,
  QuestionStatsPayload,
} from '@tahaddi/contracts';
import { siteUrl } from './join-flow';

export type PlayerIdentity = {
  sessionId: string;
  participantId: string;
  participantToken: string;
  roomCode: string;
  displayName: string;
};

export type RoomState = {
  snapshot: GameSnapshot;
  stats: QuestionStatsPayload | null;
};

export type RoomOperation = 'snapshot' | 'answer';

export type RequestFailure = { ok: false; fatal: boolean; message: string };

const GAME_PHASES: readonly GamePhase[] = [
  'LOBBY',
  'QUESTION',
  'REVEAL',
  'LEADERBOARD',
  'FINISHED',
];
export const OFFLINE_MESSAGE = 'تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.';

const ANSWER_REJECTION_MESSAGES: Record<AnswerRejectionReason, string> = {
  INVALID_SESSION: 'انتهت هذه الجلسة.',
  INVALID_PLAYER: 'لم نعد نتعرف على هذا اللاعب في الغرفة.',
  QUESTION_NOT_ACTIVE: 'انتهى وقت هذا السؤال.',
  QUESTION_MISMATCH: 'انتقل المضيف إلى سؤال آخر.',
  INVALID_OPTION: 'هذا الخيار غير متاح.',
  DUPLICATE_ANSWER: 'سُجّلت إجابتك مسبقًا.',
  ANSWER_TOO_LATE: 'وصلت الإجابة بعد انتهاء الوقت.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function joinEndpoint() {
  return siteUrl('/api/live/join');
}

export function roomEndpoint(sessionId: string) {
  return siteUrl(`/api/live/${encodeURIComponent(sessionId)}/room`);
}

export function roomRequestBody(
  identity: PlayerIdentity,
  operation: RoomOperation,
  answer?: { questionId: string; optionId: string },
) {
  return {
    operation,
    role: 'player' as const,
    subjectId: identity.participantId,
    accessToken: identity.participantToken,
    ...(answer ?? {}),
  };
}

export function parseJoinResponse(
  status: number,
  body: unknown,
): { ok: true; identity: PlayerIdentity } | RequestFailure {
  if (isRecord(body) && body.ok === true) {
    const sessionId = readString(body.sessionId);
    const participantId = readString(body.participantId);
    const participantToken = readString(body.participantToken);
    const roomCode = readString(body.roomCode);
    const displayName = readString(body.displayName);
    if (sessionId && participantId && participantToken && roomCode && displayName) {
      return {
        ok: true,
        identity: { sessionId, participantId, participantToken, roomCode, displayName },
      };
    }
  }
  const message = isRecord(body) ? readString(body.message) : null;
  return {
    ok: false,
    fatal: false,
    message: message ?? (status >= 500 ? 'تعذّر الانضمام الآن. حاول مرة أخرى.' : OFFLINE_MESSAGE),
  };
}

function isSnapshot(value: unknown): value is GameSnapshot {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.serverTime === 'number' &&
    GAME_PHASES.includes(value.phase as GamePhase) &&
    Array.isArray(value.leaderboard)
  );
}

export function parseRoomResponse(
  status: number,
  body: unknown,
): { ok: true; state: RoomState } | RequestFailure {
  if (isRecord(body) && body.ok === true && isSnapshot(body.snapshot)) {
    return {
      ok: true,
      state: {
        snapshot: body.snapshot,
        stats: isRecord(body.stats) ? (body.stats as QuestionStatsPayload) : null,
      },
    };
  }
  if (status === 401 || status === 404) {
    return { ok: false, fatal: true, message: 'انتهت هذه الجلسة أو لم تعد متاحة.' };
  }
  const reason = isRecord(body) ? (body.reason as AnswerRejectionReason | undefined) : undefined;
  if (reason && reason in ANSWER_REJECTION_MESSAGES) {
    return { ok: false, fatal: false, message: ANSWER_REJECTION_MESSAGES[reason] };
  }
  return { ok: false, fatal: false, message: OFFLINE_MESSAGE };
}

/** Offset to add to the device clock to approximate the server clock. */
export function estimateClockOffset(serverTime: number, sentAt: number, receivedAt: number) {
  const roundTrip = Math.max(0, receivedAt - sentAt);
  return serverTime + roundTrip / 2 - receivedAt;
}

export function questionCountdown(
  question: QuestionPayload,
  deviceNow: number,
  clockOffset: number,
) {
  const now = deviceNow + clockOffset;
  const total = Math.max(1, question.questionEndsAt - question.questionStartedAt);
  const remainingMs = Math.min(total, Math.max(0, question.questionEndsAt - now));
  return {
    secondsLeft: Math.ceil(remainingMs / 1_000),
    fractionLeft: remainingMs / total,
    notStarted: now < question.questionStartedAt,
  };
}

export function pollIntervalFor(phase: GamePhase | null) {
  if (phase === 'FINISHED') return null;
  if (phase === 'QUESTION') return 1_000;
  if (phase === 'LOBBY') return 2_500;
  return 1_500;
}

export function findPlayer(leaderboard: PlayerInfo[], participantId: string) {
  return leaderboard.find((player) => player.id === participantId) ?? null;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function arabicNumber(value: number) {
  return String(Math.round(value)).replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)]);
}

export const OPTION_LABELS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
