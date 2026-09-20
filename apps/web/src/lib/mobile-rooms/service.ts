import type { PlanCode } from '@tahaddi/domain';
import type { LiveConnectionTicket } from '@tahaddi/contracts';
import { isRoomCode, normalizeRoomCode } from '@/lib/quiz/room-code';

const MAX_PLAYER_NAME_LENGTH = 40;
const MAX_QUIZ_ID_LENGTH = 128;

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

type HostQuizDetails = Omit<MobileHostQuiz, 'activeRoom'> & { gameMode: string };

export type MobileRoomsRepository = {
  listHostQuizzes(userId: string): Promise<MobileHostQuiz[]>;
  findHostQuiz(userId: string, quizId: string): Promise<HostQuizDetails | null>;
  countOptionlessQuestions(quizId: string): Promise<number>;
  findOngoingSession(quizId: string, userId: string): Promise<{ id: string } | null>;
  createOrReuseSession(
    quiz: HostQuizDetails,
    userId: string,
  ): Promise<{ session: { id: string; roomCode: string; status: string }; created: boolean }>;
  readRoom(roomCode: string): Promise<MobileRoom | null>;
  joinRoomAtomically(
    sessionId: string,
    userId: string | null,
    displayName: string,
  ): Promise<
    | { status: 'joined'; participantId: string }
    | { status: 'closed' }
    | { status: 'full' }
    | { status: 'name_taken' }
  >;
};

type QuotaResult = { ok: true; unlimited: boolean } | { ok: false; message: string };

type MobileRoomsDependencies = {
  repository: MobileRoomsRepository;
  resolvePlan(
    userId: string,
    role: string,
  ): Promise<{ code: PlanCode; maxRoomPlayers: number; bypassesLimits: boolean }>;
  consumeRoomQuota(userId: string, role: string): Promise<QuotaResult>;
  refundRoomQuota(userId: string): Promise<void>;
  createHostCredential(
    sessionId: string,
    hostId: string,
    subjectVersion: number,
  ): Pick<LiveConnectionTicket, 'accessToken' | 'expiresAt' | 'subjectVersion'>;
  createPlayerCredential(
    sessionId: string,
    participantId: string,
  ): Pick<LiveConnectionTicket, 'accessToken' | 'expiresAt'>;
};

export class MobileRoomsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MobileRoomsError';
  }
}

function normalizedPlayerName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME_LENGTH);
}

function validatedRoomCode(value: string) {
  const roomCode = normalizeRoomCode(value);
  if (!isRoomCode(roomCode)) {
    throw new MobileRoomsError(
      'INVALID_ROOM_CODE',
      'الرمز يجب أن يتكوّن من 6 إلى 8 أحرف أو أرقام صالحة.',
      400,
    );
  }
  return roomCode;
}

export function createMobileRoomsService(dependencies: MobileRoomsDependencies) {
  const { repository } = dependencies;

  return {
    async listHostQuizzes(userId: string) {
      return repository.listHostQuizzes(userId);
    },

    async readRoom(roomCodeValue: string) {
      const roomCode = validatedRoomCode(roomCodeValue);
      const room = await repository.readRoom(roomCode);
      if (!room) {
        throw new MobileRoomsError('ROOM_NOT_FOUND', 'لم نجد غرفة مفتوحة بهذا الرمز.', 404);
      }
      return room;
    },

    async createRoom(input: {
      user: { id: string; role: string; tokenVersion: number };
      quizId: string;
    }) {
      const quizId = input.quizId.trim();
      if (!quizId || quizId.length > MAX_QUIZ_ID_LENGTH) {
        throw new MobileRoomsError('INVALID_QUIZ_ID', 'اختر مسابقة صالحة لإنشاء الغرفة.', 400);
      }

      const quiz = await repository.findHostQuiz(input.user.id, quizId);
      if (!quiz || quiz.questionCount === 0) {
        throw new MobileRoomsError('QUIZ_NOT_FOUND', 'المسابقة غير موجودة أو غير جاهزة.', 404);
      }
      if (quiz.gameMode !== 'QUIZ') {
        throw new MobileRoomsError(
          'UNSUPPORTED_GAME_MODE',
          'هذا النوع من الألعاب غير مدعوم في الجلسة المباشرة بعد.',
          422,
        );
      }
      if ((await repository.countOptionlessQuestions(quiz.id)) > 0) {
        throw new MobileRoomsError(
          'QUIZ_NOT_READY',
          'تحتوي المسابقة على أسئلة بلا خيارات إجابة.',
          422,
        );
      }

      const plan = await dependencies.resolvePlan(input.user.id, input.user.role);
      if (!plan.bypassesLimits && quiz.maxPlayers > plan.maxRoomPlayers) {
        throw new MobileRoomsError(
          'ROOM_LIMIT_EXCEEDED',
          `سعة المسابقة تتجاوز حد رتبة ${plan.code}.`,
          403,
        );
      }

      const ongoing = await repository.findOngoingSession(quiz.id, input.user.id);
      let quotaConsumed = false;
      if (!ongoing) {
        const quota = await dependencies.consumeRoomQuota(input.user.id, input.user.role);
        if (!quota.ok) {
          throw new MobileRoomsError('ROOM_QUOTA_EXCEEDED', quota.message, 403);
        }
        quotaConsumed = !quota.unlimited;
      }

      let sessionResult: Awaited<ReturnType<MobileRoomsRepository['createOrReuseSession']>>;
      try {
        sessionResult = await repository.createOrReuseSession(quiz, input.user.id);
      } catch (error) {
        if (quotaConsumed) await dependencies.refundRoomQuota(input.user.id).catch(() => undefined);
        throw error;
      }
      if (quotaConsumed && !sessionResult.created) {
        await dependencies.refundRoomQuota(input.user.id);
      }

      const room = await repository.readRoom(sessionResult.session.roomCode);
      if (!room) {
        throw new MobileRoomsError('ROOM_NOT_FOUND', 'تعذّر قراءة الغرفة بعد إنشائها.', 500);
      }
      return {
        room,
        ticket: {
          sessionId: sessionResult.session.id,
          subjectId: input.user.id,
          role: 'host',
          ...dependencies.createHostCredential(
            sessionResult.session.id,
            input.user.id,
            input.user.tokenVersion,
          ),
        } satisfies LiveConnectionTicket,
      };
    },

    async joinRoom(input: { roomCode: string; displayName: string; userId?: string | null }) {
      const roomCode = validatedRoomCode(input.roomCode);
      const displayName = normalizedPlayerName(input.displayName);
      if (displayName.length < 2) {
        throw new MobileRoomsError('INVALID_DISPLAY_NAME', 'اكتب اسمًا من حرفين على الأقل.', 400);
      }

      const room = await repository.readRoom(roomCode);
      if (!room) {
        throw new MobileRoomsError('ROOM_NOT_FOUND', 'لم نجد غرفة مفتوحة بهذا الرمز.', 404);
      }
      const joined = await repository.joinRoomAtomically(
        room.sessionId,
        input.userId ?? null,
        displayName,
      );
      if (joined.status === 'closed') {
        throw new MobileRoomsError('ROOM_NOT_FOUND', 'لم نجد غرفة مفتوحة بهذا الرمز.', 404);
      }
      if (joined.status === 'full') {
        throw new MobileRoomsError('ROOM_FULL', 'اكتمل عدد اللاعبين في هذه الغرفة.', 409);
      }
      if (joined.status === 'name_taken') {
        throw new MobileRoomsError('DISPLAY_NAME_TAKEN', 'هذا الاسم مستخدم في الغرفة.', 409);
      }

      return {
        room: (await repository.readRoom(roomCode)) ?? room,
        ticket: {
          sessionId: room.sessionId,
          subjectId: joined.participantId,
          role: 'player',
          ...dependencies.createPlayerCredential(room.sessionId, joined.participantId),
        } satisfies LiveConnectionTicket,
      };
    },
  };
}
