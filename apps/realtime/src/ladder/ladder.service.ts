import { Injectable } from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import type {
  LadderQuestion,
  LadderRoomSnapshot,
  LadderTeam,
} from '@tahaddi/domain';
import { RedisService } from '../game/redis.service.js';
import { DatabaseService } from '../game/database.service.js';
import type {
  CreateLadderRoomPayload,
  JoinLadderRoomPayload,
  LadderActionResult,
  LadderRoomRuntime,
} from './ladder.types.js';
import { LADDER_MAX_TEAM_PLAYERS, LADDER_TTL_SECONDS } from './ladder.types.js';
import {
  getLadderDifficulty,
  selectLadderQuestionCandidate,
} from './ladder-question-selection.js';
import { loadLadderQuestionCandidates } from './ladder-question-bank.js';

type LadderGuestIdentity = {
  guestId: string;
  guestToken: string;
  roomCode?: string;
  team?: LadderTeam;
  name?: string;
  createdAt: number;
  expiresAt: number;
};

@Injectable()
export class LadderService {
  constructor(
    private readonly redis: RedisService,
    private readonly database: DatabaseService,
  ) {}

  private async loadRoom(roomCode: string): Promise<LadderRoomRuntime | null> {
    return this.redis.loadLadderRoom<LadderRoomRuntime>(roomCode);
  }

  async getRoom(roomCode: string): Promise<LadderRoomRuntime | null> {
    return this.loadRoom(roomCode);
  }

  private async saveRoom(
    roomCode: string,
    room: LadderRoomRuntime,
  ): Promise<void> {
    await this.redis.saveLadderRoom(roomCode, room);
  }

  private async setGuestIdentity(identity: LadderGuestIdentity): Promise<void> {
    await this.redis.setLadderGuestIdentity(
      identity.guestId,
      identity,
      24 * 60 * 60,
    );
  }

  private async getGuestIdentity(
    guestId: string,
  ): Promise<LadderGuestIdentity | null> {
    return this.redis.getLadderGuestIdentity<LadderGuestIdentity>(guestId);
  }

  private async deleteGuestIdentity(guestId: string): Promise<void> {
    await this.redis.deleteLadderGuestIdentity(guestId);
  }

  private generateRoomCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tryGenerate = async () => {
        attempts += 1;
        const code = randomBytes(4).toString('hex').toUpperCase();
        const exists = await this.redis.isLadderRoomCodeActive(code);
        if (!exists) return resolve(code);
        if (attempts >= 20)
          return reject(new Error('تعذّر إنشاء رمز غرفة فريد. أعد المحاولة.'));
        await new Promise((r) => setTimeout(r, 10));
        return tryGenerate();
      };
      void tryGenerate();
    });
  }

  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').slice(0, 30);
  }

  private generateGuestToken(): string {
    return randomBytes(32).toString('hex');
  }

  private normalizeQuestionState(room: LadderRoomRuntime): LadderRoomRuntime {
    const legacyCorrectOptionId =
      room.currentQuestion &&
      'correctOptionId' in room.currentQuestion &&
      typeof room.currentQuestion.correctOptionId === 'string'
        ? room.currentQuestion.correctOptionId
        : null;
    const openedAt =
      room.questionOpenedAt ?? room.currentQuestion?.createdAt ?? null;
    const deadlineAt =
      room.questionDeadlineAt ??
      (openedAt !== null && room.currentQuestion
        ? openedAt + room.currentQuestion.timeLimit * 1000
        : null);
    return {
      ...room,
      usedQuestionIds: [...(room.usedQuestionIds ?? [])],
      recentCategoryIds: [...(room.recentCategoryIds ?? [])],
      currentQuestionId:
        room.currentQuestionId ?? room.currentQuestion?.id ?? null,
      currentDifficulty:
        room.currentDifficulty ?? room.currentQuestion?.difficulty ?? null,
      questionOpenedAt: openedAt,
      questionDeadlineAt: deadlineAt,
      currentCorrectOptionId:
        room.currentCorrectOptionId ?? legacyCorrectOptionId,
    };
  }

  private async openQuestion(
    room: LadderRoomRuntime,
    roundNumber: number,
  ): Promise<LadderRoomRuntime | null> {
    const normalizedRoom = this.normalizeQuestionState(room);
    const difficulty = getLadderDifficulty(roundNumber, room.totalRounds);
    const candidates = await loadLadderQuestionCandidates(
      this.database,
      normalizedRoom,
    );
    const selection = selectLadderQuestionCandidate({
      candidates,
      targetDifficulty: difficulty,
      usedQuestionIds: normalizedRoom.usedQuestionIds ?? [],
      recentCategoryIds: normalizedRoom.recentCategoryIds ?? [],
    });
    if (!selection) return null;

    const { candidate } = selection;
    const openedAt = Date.now();
    const timeLimit = Math.max(
      candidate.timeLimit,
      room.questionTimeLimit ?? 30,
    );
    const deadlineAt = openedAt + timeLimit * 1000;
    const correctOption = candidate.options.find((option) => option.isCorrect);
    if (!correctOption) return null;

    const publicQuestion: LadderQuestion = {
      id: candidate.id,
      roomId: room.roomCode,
      questionText: candidate.prompt,
      options: candidate.options.map(({ id, text }) => ({ id, text })),
      category: candidate.category,
      difficulty: candidate.difficulty,
      timeLimit,
      roundNumber,
      createdAt: openedAt,
    };

    return {
      ...normalizedRoom,
      currentRound: roundNumber,
      currentQuestion: publicQuestion,
      usedQuestionIds: [
        ...(normalizedRoom.usedQuestionIds ?? []),
        candidate.id,
      ],
      recentCategoryIds: [
        ...(normalizedRoom.recentCategoryIds ?? []).slice(-3),
        candidate.category.id,
      ],
      currentQuestionId: candidate.id,
      currentDifficulty: candidate.difficulty,
      questionOpenedAt: openedAt,
      questionDeadlineAt: deadlineAt,
      currentCorrectOptionId: correctOption.id,
      stopReason: undefined,
      updatedAt: openedAt,
    };
  }

  private closeCurrentQuestion(room: LadderRoomRuntime): LadderRoomRuntime {
    return {
      ...room,
      currentQuestion: null,
      currentQuestionId: null,
      currentDifficulty: null,
      questionOpenedAt: null,
      questionDeadlineAt: null,
      currentCorrectOptionId: null,
    };
  }

  private stopForExhaustedPool(room: LadderRoomRuntime): LadderRoomRuntime {
    const now = Date.now();
    return {
      ...this.closeCurrentQuestion(room),
      status: 'finished',
      endedAt: now,
      updatedAt: now,
      stopReason: {
        code: 'NO_QUESTIONS_AVAILABLE',
        message: 'نفدت الأسئلة الصالحة غير المكررة لهذه الغرفة.',
      },
    };
  }

  buildSnapshot(
    room: LadderRoomRuntime,
    viewerTeam?: LadderTeam,
    viewerGuestId?: string,
    viewerHostId?: string,
  ): LadderRoomSnapshot {
    const remainingSeconds =
      room.questionDeadlineAt == null
        ? room.currentQuestion?.timeLimit
        : Math.max(0, Math.ceil((room.questionDeadlineAt - Date.now()) / 1000));
    const currentQuestion = room.currentQuestion
      ? {
          id: room.currentQuestion.id,
          roomId: room.currentQuestion.roomId,
          questionText: room.currentQuestion.questionText,
          options: room.currentQuestion.options.map((option) => ({
            ...option,
          })),
          category: room.currentQuestion.category,
          difficulty: room.currentQuestion.difficulty,
          timeLimit: remainingSeconds ?? room.currentQuestion.timeLimit,
          roundNumber: room.currentQuestion.roundNumber,
          createdAt: room.currentQuestion.createdAt,
        }
      : null;
    const rightTeam = room.teams
      .filter((t) => t.team === 'right')
      .map((t) => ({ playerName: t.playerName, isHost: t.isHost }));
    const leftTeam = room.teams
      .filter((t) => t.team === 'left')
      .map((t) => ({ playerName: t.playerName, isHost: t.isHost }));
    const isHost = viewerHostId === room.hostId;
    return {
      roomCode: room.roomCode,
      phase: room.status,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      rightScore: room.rightScore,
      leftScore: room.leftScore,
      rightPosition: room.rightPosition,
      leftPosition: room.leftPosition,
      winningPosition: room.winningPosition,
      questionTimeLimit: room.questionTimeLimit ?? 30,
      currentQuestion,
      rightTeam,
      leftTeam,
      isHost,
      startedAt: room.startedAt,
      endedAt: room.endedAt,
    };
  }

  async executeWithRoomLock<T>(
    roomCode: string,
    action: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const token = randomUUID();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const acquired = await this.redis.acquireLadderRoomLock(roomCode, token);
      if (acquired) {
        try {
          return { acquired: true, value: await action() };
        } finally {
          await this.redis.releaseLadderRoomLock(roomCode, token);
        }
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return { acquired: false };
  }

  private async executeRoomAction(
    roomCode: string,
    action: () => Promise<LadderActionResult>,
  ): Promise<LadderActionResult> {
    const locked = await this.executeWithRoomLock(roomCode, action);
    if (!locked.acquired) {
      return {
        ok: false,
        code: 'ROOM_BUSY',
        message: 'الغرفة مشغولة حاليًا. أعد المحاولة.',
      };
    }
    return locked.value;
  }

  async createRoom(
    input: CreateLadderRoomPayload,
    hostId: string,
  ): Promise<LadderActionResult> {
    const roomCode = await this.generateRoomCode();
    const now = Date.now();
    const room: LadderRoomRuntime = {
      roomCode,
      hostId,
      status: 'waiting',
      currentRound: 0,
      totalRounds: input.totalRounds,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: input.winningPosition,
      questionTimeLimit: input.questionTimeLimit,
      quizId: input.quizId ?? null,
      currentQuestion: null,
      usedQuestionIds: [],
      recentCategoryIds: [],
      currentQuestionId: null,
      currentDifficulty: null,
      questionOpenedAt: null,
      questionDeadlineAt: null,
      currentCorrectOptionId: null,
      teams: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.saveRoom(roomCode, room);
    await this.redis.addActiveLadderRoomCode(roomCode);

    return { ok: true, room };
  }

  async joinRoom(
    input: JoinLadderRoomPayload,
    guestId: string,
    guestToken: string,
  ): Promise<LadderActionResult> {
    const roomCode = input.roomCode.toUpperCase();
    const locked = await this.executeWithRoomLock(
      roomCode,
      async (): Promise<LadderActionResult> => {
        const room = await this.loadRoom(roomCode);
        if (!room) {
          return {
            ok: false,
            code: 'ROOM_NOT_FOUND',
            message: 'لم نجد غرفة مفتوحة بهذا الرمز.',
          };
        }
        if (room.status !== 'waiting') {
          return {
            ok: false,
            code: 'GAME_STARTED',
            message: 'بدأت هذه اللعبة بالفعل.',
          };
        }

        const name = this.normalizeName(input.playerName);
        if (name.length < 2) {
          return {
            ok: false,
            code: 'INVALID_NAME',
            message: 'اكتب اسمًا من حرفين على الأقل.',
          };
        }

        const existingTeamPlayers = room.teams.filter(
          (t) => t.team === input.team,
        );
        if (existingTeamPlayers.length >= LADDER_MAX_TEAM_PLAYERS) {
          return {
            ok: false,
            code: 'TEAM_FULL',
            message: 'اكتمل عدد اللاعبين في هذا الفريق.',
          };
        }

        const existingNames = room.teams.map((t) =>
          t.playerName.toLocaleLowerCase('ar'),
        );
        if (existingNames.includes(name.toLocaleLowerCase('ar'))) {
          return {
            ok: false,
            code: 'NAME_TAKEN',
            message: 'هذا الاسم مستخدم في الغرفة.',
          };
        }

        const now = Date.now();
        const updatedRoom: LadderRoomRuntime = {
          ...room,
          teams: [
            ...room.teams,
            {
              id: guestId,
              team: input.team,
              playerName: name,
              isHost: false,
              joinedAt: now,
            },
          ],
          updatedAt: now,
        };
        await this.saveRoom(roomCode, updatedRoom);

        const guestIdentity: LadderGuestIdentity = {
          guestId,
          guestToken,
          roomCode,
          team: input.team,
          name,
          createdAt: now,
          expiresAt: now + LADDER_TTL_SECONDS * 1000,
        };
        await this.setGuestIdentity(guestIdentity);

        return { ok: true, room: updatedRoom };
      },
    );
    if (!locked.acquired) {
      return {
        ok: false,
        code: 'ROOM_BUSY',
        message: 'الغرفة مشغولة الآن. أعد المحاولة.',
      };
    }
    return locked.value;
  }

  async startGame(
    roomCode: string,
    guestId: string,
  ): Promise<LadderActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const room = await this.loadRoom(roomCode);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      if (room.hostId !== guestId) {
        return {
          ok: false,
          code: 'NOT_HOST',
          message: 'المضيف وحده يبدأ اللعبة.',
        };
      }
      if (room.status !== 'waiting') {
        return {
          ok: false,
          code: 'NOT_READY',
          message: 'الغرفة ليست جاهزة للبدء.',
        };
      }
      const rightPlayers = room.teams.filter((t) => t.team === 'right');
      const leftPlayers = room.teams.filter((t) => t.team === 'left');
      if (rightPlayers.length === 0 || leftPlayers.length === 0) {
        return {
          ok: false,
          code: 'NOT_ENOUGH_PLAYERS',
          message: 'تحتاج لاعب واحد على الأقل في كل فريق.',
        };
      }

      const startedAt = Date.now();
      const roomWithQuestion = await this.openQuestion(
        {
          ...room,
          status: 'active',
          currentRound: 1,
          startedAt,
          usedQuestionIds: [],
          recentCategoryIds: [],
          currentQuestionId: null,
          currentDifficulty: null,
          questionOpenedAt: null,
          questionDeadlineAt: null,
          currentCorrectOptionId: null,
          stopReason: undefined,
          updatedAt: startedAt,
        },
        1,
      );
      if (!roomWithQuestion) {
        return {
          ok: false,
          code: 'NO_QUESTIONS_AVAILABLE',
          message: 'لا توجد أسئلة صالحة متاحة للعبة السلم حاليًا.',
        };
      }

      await this.saveRoom(roomCode, roomWithQuestion);
      return { ok: true, room: roomWithQuestion };
    });
  }

  async submitAnswer(
    guestId: string,
    roomCode: string,
    questionId: string,
    optionId: string,
  ): Promise<LadderActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const loadedRoom = await this.loadRoom(roomCode);
      if (!loadedRoom) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const room = this.normalizeQuestionState(loadedRoom);
      if (room.status !== 'active') {
        return {
          ok: false,
          code: 'GAME_NOT_ACTIVE',
          message: 'اللعبة غير نشطة حاليًا.',
        };
      }
      if (room.currentQuestion?.id !== questionId) {
        return {
          ok: false,
          code: 'QUESTION_MISMATCH',
          message: 'السؤال الحالي غير مطابق.',
        };
      }

      if (
        !room.currentQuestion.options.some((option) => option.id === optionId)
      ) {
        return {
          ok: false,
          code: 'INVALID_OPTION',
          message: 'خيار الإجابة غير صالح لهذا السؤال.',
        };
      }

      if (
        room.questionDeadlineAt != null &&
        Date.now() >= room.questionDeadlineAt
      ) {
        return {
          ok: false,
          code: 'QUESTION_EXPIRED',
          message: 'انتهى وقت الإجابة عن هذا السؤال.',
        };
      }

      const team = room.teams.find((member) => member.id === guestId);
      let teamSide: LadderTeam | undefined = team?.team;

      if (!teamSide) {
        const identity = await this.getGuestIdentity(guestId);
        if (!identity?.team || identity.roomCode !== roomCode) {
          return {
            ok: false,
            code: 'NOT_A_PLAYER',
            message: 'لست لاعبًا في هذه الغرفة.',
          };
        }
        teamSide = identity.team;
      }

      if (
        !room.currentCorrectOptionId ||
        !room.currentQuestion.options.some(
          (option) => option.id === room.currentCorrectOptionId,
        )
      ) {
        return {
          ok: false,
          code: 'QUESTION_STATE_INVALID',
          message: 'تعذّر التحقق من السؤال الحالي. أعد مزامنة الغرفة.',
        };
      }

      const isCorrect = room.currentCorrectOptionId === optionId;
      const scoredRoom: LadderRoomRuntime =
        teamSide === 'right'
          ? {
              ...room,
              rightScore: room.rightScore + (isCorrect ? 100 : 0),
              rightPosition: isCorrect
                ? Math.min(room.rightPosition + 1, room.winningPosition)
                : Math.max(room.rightPosition - 1, 0),
              updatedAt: Date.now(),
            }
          : {
              ...room,
              leftScore: room.leftScore + (isCorrect ? 100 : 0),
              leftPosition: isCorrect
                ? Math.min(room.leftPosition + 1, room.winningPosition)
                : Math.max(room.leftPosition - 1, 0),
              updatedAt: Date.now(),
            };
      const answeredRoom = this.closeCurrentQuestion(scoredRoom);

      const winner =
        answeredRoom.rightPosition >= answeredRoom.winningPosition
          ? 'right'
          : answeredRoom.leftPosition >= answeredRoom.winningPosition
            ? 'left'
            : null;

      let nextRoom: LadderRoomRuntime;
      if (winner) {
        const endedAt = Date.now();
        nextRoom = {
          ...answeredRoom,
          status: 'finished',
          endedAt,
          updatedAt: endedAt,
        };
      } else if (answeredRoom.currentRound >= answeredRoom.totalRounds) {
        const endedAt = Date.now();
        nextRoom = {
          ...answeredRoom,
          status: 'finished',
          endedAt,
          updatedAt: endedAt,
        };
      } else {
        nextRoom =
          (await this.openQuestion(
            answeredRoom,
            answeredRoom.currentRound + 1,
          )) ?? this.stopForExhaustedPool(answeredRoom);
      }

      await this.saveRoom(roomCode, nextRoom);
      return { ok: true, room: nextRoom };
    });
  }

  async expireQuestion(
    roomCode: string,
    questionId: string,
  ): Promise<LadderActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const loadedRoom = await this.loadRoom(roomCode);
      if (!loadedRoom) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const room = this.normalizeQuestionState(loadedRoom);
      if (room.status !== 'active' || room.currentQuestionId !== questionId) {
        return {
          ok: false,
          code: 'QUESTION_MISMATCH',
          message: 'السؤال الحالي غير مطابق.',
        };
      }
      if (
        room.questionDeadlineAt == null ||
        Date.now() < room.questionDeadlineAt
      ) {
        return {
          ok: false,
          code: 'QUESTION_NOT_EXPIRED',
          message: 'وقت السؤال لم ينته بعد.',
        };
      }

      const expiredRoom = this.closeCurrentQuestion(room);
      let nextRoom: LadderRoomRuntime;
      if (expiredRoom.currentRound >= expiredRoom.totalRounds) {
        const endedAt = Date.now();
        nextRoom = {
          ...expiredRoom,
          status: 'finished',
          endedAt,
          updatedAt: endedAt,
        };
      } else {
        nextRoom =
          (await this.openQuestion(
            expiredRoom,
            expiredRoom.currentRound + 1,
          )) ?? this.stopForExhaustedPool(expiredRoom);
      }

      await this.saveRoom(roomCode, nextRoom);
      return { ok: true, room: nextRoom };
    });
  }

  async leaveRoom(
    guestId: string,
    roomCode: string,
  ): Promise<LadderActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const room = await this.loadRoom(roomCode);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      if (room.hostId === guestId) {
        await this.deleteRoom(roomCode);
        return {
          ok: false,
          code: 'HOST_LEFT',
          message: 'غادر المضيف وانتهت الغرفة.',
        };
      }
      const teamIndex = room.teams.findIndex((t) => t.id === guestId);
      if (teamIndex === -1) {
        return {
          ok: false,
          code: 'NOT_IN_ROOM',
          message: 'لست في هذه الغرفة.',
        };
      }
      room.teams.splice(teamIndex, 1);
      if (room.teams.length === 0) {
        await this.deleteRoom(roomCode);
        return { ok: true, room };
      }
      if (room.status === 'waiting') {
        room.status = 'waiting';
      }
      room.updatedAt = Date.now();
      await this.saveRoom(roomCode, room);
      return { ok: true, room };
    });
  }

  async deleteRoom(roomCode: string): Promise<void> {
    await this.redis.deleteLadderRoom(roomCode);
    await this.redis.removeActiveLadderRoomCode(roomCode);
  }

  async validateGuest(
    guestId: string,
    guestToken?: string,
  ): Promise<LadderGuestIdentity | null> {
    if (!guestToken) return null;
    let identity = await this.getGuestIdentity(guestId);
    if (!identity) {
      const now = Date.now();
      identity = {
        guestId,
        guestToken,
        createdAt: now,
        expiresAt: now + LADDER_TTL_SECONDS * 1000,
      };
      await this.setGuestIdentity(identity);
      return identity;
    }
    if (Date.now() > identity.expiresAt) {
      await this.redis.deleteLadderGuestIdentity(guestId);
      return null;
    }
    if (identity.guestToken !== guestToken) {
      return null;
    }
    return identity;
  }

  async handleReconnect(
    guestId: string,
    roomCode: string,
  ): Promise<LadderActionResult> {
    const locked = await this.executeWithRoomLock(roomCode, async () => {
      const room = await this.loadRoom(roomCode);
      if (!room) {
        return {
          ok: false as const,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const team = room.teams.find((t) => t.id === guestId);
      if (!team) {
        return {
          ok: false as const,
          code: 'NOT_IN_ROOM',
          message: 'لست في هذه الغرفة.',
        };
      }
      return { ok: true as const, room };
    });

    if (!locked.acquired) {
      return {
        ok: false,
        code: 'ROOM_BUSY',
        message: 'الغرفة مشغولة حاليًا. أعد المحاولة.',
      };
    }
    return locked.value;
  }

  async handleHostReconnect(
    hostId: string,
    roomCode: string,
  ): Promise<LadderActionResult> {
    const room = await this.loadRoom(roomCode);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: 'الغرفة غير موجودة.',
      };
    }
    if (room.hostId !== hostId) {
      return {
        ok: false,
        code: 'NOT_HOST',
        message: 'لا تملك صلاحية إدارة هذه الغرفة.',
      };
    }
    return { ok: true, room };
  }
}
