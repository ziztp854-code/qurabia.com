import { Injectable } from '@nestjs/common';
import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
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
import { resolveLadderWinner, scoreLadderAnswer } from './ladder-scoring.js';

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
  private readonly roomLocks = new AsyncLocalStorage<{
    roomCode: string;
    token: string;
  }>();
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
    identity?: LadderGuestIdentity,
    unbindGuestId?: string,
  ): Promise<LadderRoomRuntime> {
    const lock = this.roomLocks.getStore();
    const updated = { ...room, revision: (room.revision ?? 0) + 1 };
    const revision = await this.redis.saveLadderRoom(
      roomCode,
      updated,
      lock?.roomCode === roomCode ? lock.token : undefined,
      identity ? { guestId: identity.guestId, identity } : undefined,
      unbindGuestId,
    );
    return { ...updated, revision };
  }

  private async getGuestIdentity(
    guestId: string,
  ): Promise<LadderGuestIdentity | null> {
    return this.redis.getLadderGuestIdentity<LadderGuestIdentity>(guestId);
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
      difficulty,
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
    const automaticTimes = { EASY: 20, MEDIUM: 30, HARD: 45 } as const;
    const timeLimit = room.automaticQuestionTime
      ? automaticTimes[candidate.difficulty]
      : Math.max(candidate.timeLimit, room.questionTimeLimit ?? 30);
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
      answers: {},
      roundResult: null,
      revealUntil: null,
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

  private async openNextQuestion(
    room: LadderRoomRuntime,
  ): Promise<LadderRoomRuntime> {
    try {
      return (
        (await this.openQuestion(room, room.currentRound + 1)) ??
        this.stopForExhaustedPool(room)
      );
    } catch {
      return {
        ...this.stopForExhaustedPool(room),
        stopReason: {
          code: 'QUESTION_BANK_UNAVAILABLE',
          message: 'تعذّر تحميل السؤال التالي. حُفظت نتيجة الجولة الحالية.',
        },
      };
    }
  }

  buildSnapshot(
    room: LadderRoomRuntime,
    viewerTeam?: LadderTeam,
    viewerGuestId?: string,
    viewerHostId?: string,
  ): LadderRoomSnapshot {
    const remainingSeconds = room.roundResult
      ? 0
      : room.questionDeadlineAt == null
        ? room.currentQuestion?.timeLimit
        : Math.max(0, Math.ceil((room.questionDeadlineAt - Date.now()) / 1000));
    const currentQuestion = room.currentQuestion
      ? {
          id: room.currentQuestion.id,
          roomId: room.currentQuestion.roomId,
          questionText: room.currentQuestion.questionText,
          options: room.currentQuestion.options.map(({ id, text }) => ({
            id,
            text,
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
      revision: room.revision ?? 0,
      answerStatus: {
        right: Boolean(room.answers?.right),
        left: Boolean(room.answers?.left),
      },
      myAnswer:
        viewerTeam &&
        room.teams.some(
          (member) => member.id === viewerGuestId && member.team === viewerTeam,
        )
          ? (room.answers?.[viewerTeam]?.optionId ?? null)
          : null,
      roundResult: room.roundResult ?? null,
      roundHistory: room.roundHistory ?? [],
      winner:
        room.status === 'finished' && !room.stopReason
          ? (room.winner ?? null)
          : null,
      winnerMethod:
        room.status === 'finished' && !room.stopReason
          ? (room.winnerMethod ?? null)
          : null,
      questionDeadlineAt: room.questionDeadlineAt ?? null,
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
        let renewing = false;
        const timer = setInterval(() => {
          if (renewing) return;
          renewing = true;
          void this.redis
            .renewLadderRoomLock(roomCode, token)
            .catch(() => false)
            .finally(() => {
              renewing = false;
            });
        }, 2000);
        timer.unref?.();
        try {
          return {
            acquired: true,
            value: await this.roomLocks.run({ roomCode, token }, action),
          };
        } catch (error) {
          if (error instanceof Error && error.message === 'LADDER_LOCK_LOST')
            return { acquired: false };
          throw error;
        } finally {
          clearInterval(timer);
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
      totalRounds: 10,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: 10,
      questionTimeLimit: input.questionTimeLimit ?? 30,
      automaticQuestionTime: input.questionTimeLimit === undefined,
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

    const savedRoom = await this.saveRoom(roomCode, room);
    await this.redis.addActiveLadderRoomCode(roomCode);

    return { ok: true, room: savedRoom };
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

        if (room.teams.some((member) => member.id === guestId)) {
          return {
            ok: false,
            code: 'ALREADY_JOINED',
            message: 'هذه الهوية مسجلة بالفعل في الغرفة.',
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
            message: 'هذا المقعد مشغول بالفعل.',
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
        const guestIdentity: LadderGuestIdentity = {
          guestId,
          guestToken,
          roomCode,
          team: input.team,
          name,
          createdAt: now,
          expiresAt: now + LADDER_TTL_SECONDS * 1000,
        };
        let savedRoom: LadderRoomRuntime;
        try {
          savedRoom = await this.saveRoom(roomCode, updatedRoom, guestIdentity);
        } catch (error) {
          if (error instanceof Error && error.message === 'LADDER_GUEST_BOUND')
            return {
              ok: false,
              code: 'GUEST_IN_ANOTHER_ROOM',
              message: 'هذه الهوية مرتبطة بغرفة أخرى. غادرها أولاً.',
            };
          throw error;
        }

        return { ok: true, room: savedRoom };
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
      if (rightPlayers.length !== 1 || leftPlayers.length !== 1) {
        return {
          ok: false,
          code: 'NOT_ENOUGH_PLAYERS',
          message: 'تحتاج متسابقًا واحدًا في كل جهة.',
        };
      }

      const startedAt = Date.now();
      let roomWithQuestion: LadderRoomRuntime | null;
      try {
        roomWithQuestion = await this.openQuestion(
          {
            ...room,
            status: 'active',
            totalRounds: 10,
            winningPosition: 10,
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
      } catch {
        return {
          ok: false,
          code: 'QUESTION_BANK_UNAVAILABLE',
          message: 'تعذّر تحميل الأسئلة. حاول بدء اللعبة مرة أخرى.',
        };
      }
      if (!roomWithQuestion) {
        return {
          ok: false,
          code: 'NO_QUESTIONS_AVAILABLE',
          message: 'لا توجد أسئلة صالحة متاحة للعبة السلم حاليًا.',
        };
      }

      const savedRoom = await this.saveRoom(roomCode, roomWithQuestion);
      return { ok: true, room: savedRoom };
    });
  }

  private revealRound(room: LadderRoomRuntime): LadderRoomRuntime {
    const question = room.currentQuestion!;
    const correctOptionId = room.currentCorrectOptionId!;
    const answerFor = (side: LadderTeam) => {
      const answer = room.answers?.[side];
      const correct = answer?.optionId === correctOptionId;
      return {
        optionId: answer?.optionId ?? null,
        correct,
        elapsedMs: answer?.elapsedMs ?? null,
        points: scoreLadderAnswer(
          question.difficulty,
          correct,
          answer?.elapsedMs ?? question.timeLimit * 1000,
          question.timeLimit * 1000,
        ),
      };
    };
    const rightRaw = answerFor('right');
    const leftRaw = answerFor('left');
    const right = {
      ...rightRaw,
      points: Math.max(0, room.rightScore + rightRaw.points) - room.rightScore,
    };
    const left = {
      ...leftRaw,
      points: Math.max(0, room.leftScore + leftRaw.points) - room.leftScore,
    };
    const result = {
      roundNumber: room.currentRound,
      questionId: question.id,
      questionText: question.questionText,
      options: question.options,
      correctOptionId,
      right,
      left,
    };
    const now = Date.now();
    return {
      ...room,
      rightPosition: Math.max(
        0,
        Math.min(10, room.rightPosition + (right.correct ? 1 : -1)),
      ),
      leftPosition: Math.max(
        0,
        Math.min(10, room.leftPosition + (left.correct ? 1 : -1)),
      ),
      rightScore: Math.max(0, room.rightScore + right.points),
      leftScore: Math.max(0, room.leftScore + left.points),
      roundResult: result,
      roundHistory: [...(room.roundHistory ?? []), result],
      revealUntil: now + 4000,
      questionDeadlineAt: null,
      updatedAt: now,
    };
  }

  async submitAnswer(
    guestId: string,
    roomCode: string,
    questionId: string,
    optionId: string,
    receivedAt = Date.now(),
  ): Promise<LadderActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const loaded = await this.loadRoom(roomCode);
      if (!loaded)
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      const room = this.normalizeQuestionState(loaded);
      if (
        room.status !== 'active' ||
        room.currentQuestion?.id !== questionId ||
        room.roundResult
      )
        return {
          ok: false,
          code: 'QUESTION_MISMATCH',
          message: 'السؤال الحالي غير متاح للإجابة.',
        };
      if (
        !room.currentQuestion.options.some((option) => option.id === optionId)
      )
        return {
          ok: false,
          code: 'INVALID_OPTION',
          message: 'خيار الإجابة غير صالح.',
        };
      if (
        room.questionDeadlineAt == null ||
        receivedAt >= room.questionDeadlineAt
      )
        return {
          ok: false,
          code: 'QUESTION_EXPIRED',
          message: 'انتهى وقت الإجابة.',
        };
      const member = room.teams.find((player) => player.id === guestId);
      if (!member)
        return {
          ok: false,
          code: 'NOT_A_PLAYER',
          message: 'لست لاعبًا في هذه الغرفة.',
        };
      if (room.answers?.[member.team])
        return {
          ok: false,
          code: 'ALREADY_ANSWERED',
          message: 'تم تسجيل إجابتك بالفعل.',
        };
      if (
        !room.currentCorrectOptionId ||
        !room.currentQuestion.options.some(
          (option) => option.id === room.currentCorrectOptionId,
        )
      )
        return {
          ok: false,
          code: 'QUESTION_STATE_INVALID',
          message: 'تعذّر التحقق من السؤال.',
        };
      const updated: LadderRoomRuntime = {
        ...room,
        answers: {
          ...room.answers,
          [member.team]: {
            optionId,
            elapsedMs: Math.max(
              0,
              receivedAt - (room.questionOpenedAt ?? receivedAt),
            ),
          },
        },
        updatedAt: receivedAt,
      };
      const next =
        updated.answers?.right && updated.answers?.left
          ? this.revealRound(updated)
          : updated;
      const savedRoom = await this.saveRoom(roomCode, next);
      return { ok: true, room: savedRoom };
    });
  }

  async expireQuestion(
    roomCode: string,
    questionId: string,
  ): Promise<LadderActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const loaded = await this.loadRoom(roomCode);
      if (!loaded)
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      const room = this.normalizeQuestionState(loaded);
      if (
        room.status !== 'active' ||
        room.currentQuestionId !== questionId ||
        room.roundResult
      )
        return {
          ok: false,
          code: 'QUESTION_MISMATCH',
          message: 'السؤال الحالي غير مطابق.',
        };
      if (
        room.questionDeadlineAt == null ||
        Date.now() < room.questionDeadlineAt
      )
        return {
          ok: false,
          code: 'QUESTION_NOT_EXPIRED',
          message: 'وقت السؤال لم ينته بعد.',
        };
      if (!room.currentQuestion || !room.currentCorrectOptionId)
        return {
          ok: false,
          code: 'QUESTION_STATE_INVALID',
          message: 'تعذّر التحقق من السؤال.',
        };
      const next = this.revealRound(room);
      const savedRoom = await this.saveRoom(roomCode, next);
      return { ok: true, room: savedRoom };
    });
  }

  async advanceRound(
    roomCode: string,
    questionId: string,
  ): Promise<LadderActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const room = await this.loadRoom(roomCode);
      if (
        !room ||
        room.status !== 'active' ||
        room.currentQuestionId !== questionId ||
        !room.roundResult
      )
        return {
          ok: false,
          code: 'QUESTION_MISMATCH',
          message: 'لا توجد نتيجة جاهزة.',
        };
      if (room.revealUntil == null || Date.now() < room.revealUntil)
        return {
          ok: false,
          code: 'REVEAL_NOT_FINISHED',
          message: 'عرض النتيجة لم ينته بعد.',
        };
      const now = Date.now();
      const elapsed = (side: LadderTeam) =>
        (room.roundHistory ?? []).reduce(
          (sum, result) =>
            sum + (result[side].correct ? (result[side].elapsedMs ?? 0) : 0),
          0,
        );
      const correctCount = (side: LadderTeam) =>
        (room.roundHistory ?? []).filter((result) => result[side].correct)
          .length;
      const next =
        room.currentRound >= 10
          ? {
              ...room,
              ...resolveLadderWinner(
                room.rightPosition,
                room.leftPosition,
                room.rightScore,
                room.leftScore,
                elapsed('right'),
                elapsed('left'),
                correctCount('right'),
                correctCount('left'),
                () => (randomInt(2) === 0 ? 'right' : 'left'),
              ),
              status: 'finished' as const,
              endedAt: now,
              updatedAt: now,
              revealUntil: null,
            }
          : await this.openNextQuestion(room);
      const savedRoom = await this.saveRoom(roomCode, next);
      return { ok: true, room: savedRoom };
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
      if (room.status === 'active') {
        return {
          ok: false,
          code: 'GAME_IN_PROGRESS',
          message:
            'يمكنك إعادة الاتصال؛ تستمر اللعبة وتُحسب المهلة عند عدم الإجابة.',
        };
      }
      room.teams.splice(teamIndex, 1);
      if (room.teams.length === 0) {
        await this.deleteRoom(roomCode, guestId);
        return { ok: true, room };
      }
      if (room.status === 'waiting') {
        room.status = 'waiting';
      }
      room.updatedAt = Date.now();
      const savedRoom = await this.saveRoom(roomCode, room, undefined, guestId);
      return { ok: true, room: savedRoom };
    });
  }

  async deleteRoom(roomCode: string, unbindGuestId?: string): Promise<void> {
    const lock = this.roomLocks.getStore();
    await this.redis.deleteLadderRoom(
      roomCode,
      lock?.roomCode === roomCode ? lock.token : undefined,
      unbindGuestId,
    );
  }

  async validateGuest(
    guestId: string,
    guestToken?: string,
    createIfMissing = true,
  ): Promise<LadderGuestIdentity | null> {
    if (!guestToken) return null;
    let identity = await this.getGuestIdentity(guestId);
    if (!identity) {
      if (!createIfMissing) return null;
      const now = Date.now();
      identity = {
        guestId,
        guestToken,
        createdAt: now,
        expiresAt: now + LADDER_TTL_SECONDS * 1000,
      };
      return identity;
    }
    if (Date.now() > identity.expiresAt) {
      await this.redis.deleteExpiredLadderGuestIdentity(guestId, Date.now());
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
