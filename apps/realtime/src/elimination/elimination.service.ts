import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  buildEliminationRoomSnapshot,
  difficultyForRound,
  resolveEliminationRound,
  ELIMINATION_MAX_PLAYERS,
  ELIMINATION_SCORING_POLICY_VERSION,
  ELIMINATION_TTL_SECONDS,
  type EliminationPlayer,
  type EliminationQuestion,
  type EliminationRoundResult,
} from '@tahaddi/domain';
import { RedisService } from '../game/redis.service.js';
import { DatabaseService } from '../game/database.service.js';
import {
  loadEliminationQuestions,
  pickQuestionForDifficulty,
} from './elimination-question-bank.js';
import type {
  CreateEliminationRoomPayload,
  EliminationActionResult,
  EliminationAnswerSubmitResult,
  EliminationGuestIdentity,
  EliminationRoomRuntime,
  JoinEliminationRoomPayload,
} from './elimination.types.js';

@Injectable()
export class EliminationService {
  constructor(
    private readonly redis: RedisService,
    private readonly database: DatabaseService,
  ) {}

  private async loadRoom(
    roomCode: string,
  ): Promise<EliminationRoomRuntime | null> {
    return this.redis.loadEliminationRoom<EliminationRoomRuntime>(roomCode);
  }

  async getRoom(roomCode: string): Promise<EliminationRoomRuntime | null> {
    return this.loadRoom(roomCode);
  }

  private async saveRoom(
    roomCode: string,
    room: EliminationRoomRuntime,
  ): Promise<void> {
    await this.redis.saveEliminationRoom(roomCode, room);
  }

  private async setGuestIdentity(
    identity: EliminationGuestIdentity,
  ): Promise<void> {
    await this.redis.setEliminationGuestIdentity(
      identity.guestId,
      identity,
      24 * 60 * 60,
    );
  }

  private async getGuestIdentity(
    guestId: string,
  ): Promise<EliminationGuestIdentity | null> {
    return this.redis.getEliminationGuestIdentity<EliminationGuestIdentity>(
      guestId,
    );
  }

  private generateRoomCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tryGenerate = async () => {
        attempts += 1;
        let code = '';
        const bytes = randomBytes(6);
        for (let i = 0; i < 6; i += 1) {
          code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
        }
        const exists = await this.redis.isEliminationRoomCodeActive(code);
        if (!exists) return resolve(code);
        if (attempts >= 20) {
          return reject(new Error('تعذّر إنشاء رمز غرفة فريد. أعد المحاولة.'));
        }
        await new Promise((r) => setTimeout(r, 10));
        return tryGenerate();
      };
      void tryGenerate();
    });
  }

  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').slice(0, 30);
  }

  private pickQuestion(
    room: EliminationRoomRuntime,
    roundNumber: number,
    bank: readonly EliminationQuestion[],
  ): EliminationQuestion | null {
    const questionId = room.questionOrder[roundNumber - 1];
    const planned = questionId
      ? bank.find((question) => question.id === questionId)
      : undefined;
    if (planned) return planned;
    const difficulty = difficultyForRound(roundNumber, room.totalRounds);
    return pickQuestionForDifficulty(bank, difficulty, room.usedQuestionIds);
  }

  private async openRound(
    room: EliminationRoomRuntime,
    roundNumber: number,
  ): Promise<EliminationRoomRuntime | null> {
    const bank = await loadEliminationQuestions(this.database);
    if (bank.length === 0) return null;
    const question = this.pickQuestion(room, roundNumber, bank);
    if (!question) return null;

    const openedAt = Date.now();
    return {
      ...room,
      status: 'active',
      currentRound: roundNumber,
      currentQuestion: question,
      questionOpenedAt: openedAt,
      questionDeadlineAt: openedAt + room.roundTimeLimit * 1000,
      usedQuestionIds: [...room.usedQuestionIds, question.id],
      players: room.players.map((player) =>
        player.alive ? { ...player, answer: null } : player,
      ),
      lastRoundResult: null,
      stopReason: undefined,
      updatedAt: openedAt,
    };
  }

  buildSnapshot(
    room: EliminationRoomRuntime,
    viewerPlayerId: string | null,
    viewerHostId: string | null,
    now = Date.now(),
  ) {
    const isHost = viewerHostId != null && viewerHostId === room.hostId;
    return buildEliminationRoomSnapshot(room, viewerPlayerId, isHost, now);
  }

  private async executeWithRoomLock<T>(
    roomCode: string,
    action: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const token = randomUUID();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const acquired = await this.redis.acquireEliminationRoomLock(
        roomCode,
        token,
      );
      if (acquired) {
        try {
          return { acquired: true, value: await action() };
        } finally {
          await this.redis.releaseEliminationRoomLock(roomCode, token);
        }
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return { acquired: false };
  }

  private async executeRoomAction<T>(
    roomCode: string,
    action: () => Promise<T>,
  ): Promise<T | { ok: false; code: string; message: string }> {
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
    input: CreateEliminationRoomPayload,
    hostId: string,
  ): Promise<EliminationActionResult> {
    const bank = await loadEliminationQuestions(this.database);
    if (bank.length === 0) {
      return {
        ok: false,
        code: 'NO_QUESTIONS_AVAILABLE',
        message:
          'لا توجد أسئلة اختيار متعدد منشورة بعد. انشر أسئلة في بنك الأسئلة ثم أعد المحاولة.',
      };
    }

    const roomCode = await this.generateRoomCode();
    const now = Date.now();

    // خطط لسلسلة الأسئلة حسب تصاعد الصعوبة قبل فتح الغرفة.
    const usedIds: string[] = [];
    const questionOrder: string[] = [];
    for (let round = 1; round <= input.totalRounds; round += 1) {
      const difficulty = difficultyForRound(round, input.totalRounds);
      const question = pickQuestionForDifficulty(bank, difficulty, usedIds);
      if (!question) break;
      usedIds.push(question.id);
      questionOrder.push(question.id);
    }
    if (questionOrder.length < input.totalRounds) {
      return {
        ok: false,
        code: 'NO_QUESTIONS_AVAILABLE',
        message: 'عدد الأسئلة المنشورة لا يكفي لعدد الجولات المطلوب.',
      };
    }

    const room: EliminationRoomRuntime = {
      roomCode,
      hostId,
      status: 'waiting',
      totalRounds: input.totalRounds,
      currentRound: 0,
      roundTimeLimit: input.roundTimeLimit,
      questionOrder,
      usedQuestionIds: [],
      currentQuestion: null,
      questionOpenedAt: null,
      questionDeadlineAt: null,
      players: [],
      lastRoundResult: null,
      createdAt: now,
      updatedAt: now,
      scoringPolicyVersion: ELIMINATION_SCORING_POLICY_VERSION,
    };

    await this.saveRoom(roomCode, room);
    await this.redis.addActiveEliminationRoomCode(roomCode);
    return { ok: true, room };
  }

  async joinRoom(
    input: JoinEliminationRoomPayload,
    guestId: string,
    guestToken: string,
  ): Promise<EliminationActionResult> {
    const roomCode = input.roomCode.toUpperCase();
    const locked = await this.executeWithRoomLock(
      roomCode,
      async (): Promise<EliminationActionResult> => {
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
            message: 'بدأت الحلقة بالفعل. انتظر حلقة جديدة.',
          };
        }
        if (room.players.length >= ELIMINATION_MAX_PLAYERS) {
          return {
            ok: false,
            code: 'ROOM_FULL',
            message: 'اكتمل عدد اللاعبين في هذه الحلقة.',
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

        const existingNames = room.players.map((player) =>
          player.name.toLocaleLowerCase('ar'),
        );
        if (existingNames.includes(name.toLocaleLowerCase('ar'))) {
          return {
            ok: false,
            code: 'NAME_TAKEN',
            message: 'هذا الاسم مستخدم في الحلقة.',
          };
        }

        const now = Date.now();
        const updatedRoom: EliminationRoomRuntime = {
          ...room,
          players: [
            ...room.players,
            {
              id: guestId,
              name,
              alive: true,
              eliminatedAtRound: null,
              answer: null,
              joinedAt: now,
            },
          ],
          updatedAt: now,
        };
        await this.saveRoom(roomCode, updatedRoom);

        await this.setGuestIdentity({
          guestId,
          guestToken,
          roomCode,
          name,
          createdAt: now,
          expiresAt: now + ELIMINATION_TTL_SECONDS * 1000,
        });

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
    hostId: string,
  ): Promise<EliminationActionResult> {
    return this.executeRoomAction(roomCode, async () => {
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
          message: 'المضيف وحده يبدأ الحلقة.',
        };
      }
      if (room.status !== 'waiting') {
        return {
          ok: false,
          code: 'ALREADY_ACTIVE',
          message: 'الحلقة بدأت بالفعل.',
        };
      }
      const alivePlayers = room.players.filter((player) => player.alive);
      if (alivePlayers.length < 2) {
        return {
          ok: false,
          code: 'NOT_ENOUGH_PLAYERS',
          message: 'انضم لاعبان على الأقل قبل البدء.',
        };
      }

      const startedAt = Date.now();
      const nextRoom = await this.openRound(
        {
          ...room,
          status: 'waiting',
          startedAt,
          currentRound: 0,
          usedQuestionIds: [],
        },
        1,
      );
      if (!nextRoom) {
        return {
          ok: false,
          code: 'NO_QUESTIONS_AVAILABLE',
          message: 'لا توجد أسئلة متاحة لهذه الحلقة.',
        };
      }
      await this.saveRoom(roomCode, nextRoom);
      return { ok: true, room: nextRoom };
    });
  }

  async submitAnswer(
    guestId: string,
    roomCode: string,
    questionId: string,
    optionIndex: number,
    submissionId: string,
  ): Promise<EliminationAnswerSubmitResult> {
    return this.executeRoomAction(roomCode, async () => {
      const fail = (code: string, message: string) => ({
        ok: false as const,
        code,
        message,
        submissionId,
      });

      const room = await this.loadRoom(roomCode);
      if (!room) return fail('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
      if (room.status !== 'active') {
        return fail('GAME_NOT_ACTIVE', 'لا توجد جولة نشطة حاليًا.');
      }
      if (!room.currentQuestion || room.currentQuestion.id !== questionId) {
        return fail('QUESTION_MISMATCH', 'السؤال الحالي غير مطابق.');
      }
      if (
        room.questionDeadlineAt != null &&
        Date.now() >= room.questionDeadlineAt
      ) {
        return fail('ROUND_EXPIRED', 'انتهى وقت هذه الجولة.');
      }

      const player = room.players.find((candidate) => candidate.id === guestId);
      if (!player) {
        return fail('NOT_A_PLAYER', 'لست لاعبًا في هذه الحلقة.');
      }
      if (!player.alive) {
        return fail('PLAYER_ELIMINATED', 'أُقصيت من هذه الحلقة.');
      }
      if (player.answer) {
        return fail('ALREADY_ANSWERED', 'أجبت عن هذا السؤال بالفعل.');
      }
      if (
        optionIndex < 0 ||
        optionIndex >= room.currentQuestion.options.length
      ) {
        return fail('INVALID_OPTION', 'الخيار المختار غير موجود.');
      }

      const now = Date.now();
      const updatedPlayer: EliminationPlayer = {
        ...player,
        answer: { optionIndex, answeredAt: now },
      };
      let updatedRoom: EliminationRoomRuntime = {
        ...room,
        players: room.players.map((candidate) =>
          candidate.id === guestId ? updatedPlayer : candidate,
        ),
        updatedAt: now,
      };

      // إذا أجب كل الأحياء، أغلق الجولة فورًا دون انتظار المؤقت.
      const alivePlayers = updatedRoom.players.filter(
        (candidate) => candidate.alive,
      );
      if (alivePlayers.every((candidate) => candidate.answer != null)) {
        updatedRoom = this.closeRound(updatedRoom);
      }

      await this.saveRoom(roomCode, updatedRoom);
      return {
        ok: true as const,
        room: updatedRoom,
        accepted: { submissionId, questionId, optionIndex },
      };
    });
  }

  private closeRound(room: EliminationRoomRuntime): EliminationRoomRuntime {
    if (!room.currentQuestion) return room;
    const alivePlayers = room.players.filter((player) => player.alive);
    const outcome = resolveEliminationRound(
      alivePlayers,
      room.currentQuestion.correctIndex,
    );

    const eliminatedAtRound = room.currentRound;
    const survivorIdSet = new Set(outcome.survivorIds);
    const players = room.players.map((player) => {
      if (!player.alive) return player;
      if (survivorIdSet.has(player.id)) return { ...player, answer: null };
      return {
        ...player,
        alive: false,
        eliminatedAtRound,
        answer: player.answer,
      };
    });

    const survivorsCount = players.filter((player) => player.alive).length;
    const isLastRound =
      room.currentRound >= room.totalRounds || survivorsCount <= 1;

    const result: EliminationRoundResult = {
      roundNumber: room.currentRound,
      questionId: room.currentQuestion.id,
      prompt: room.currentQuestion.prompt,
      options: [...room.currentQuestion.options],
      correctIndex: room.currentQuestion.correctIndex,
      difficulty: room.currentQuestion.difficulty,
      survivorIds: outcome.survivorIds,
      eliminatedIds: outcome.eliminatedIds,
      everyoneCorrect: outcome.everyoneCorrect,
    };

    const now = Date.now();
    return {
      ...room,
      status: isLastRound ? 'finished' : 'between',
      players,
      currentQuestion: null,
      questionOpenedAt: null,
      questionDeadlineAt: null,
      lastRoundResult: result,
      ...(isLastRound ? { endedAt: now } : {}),
      updatedAt: now,
    };
  }

  async endRound(
    roomCode: string,
    hostId: string,
  ): Promise<EliminationActionResult> {
    return this.executeRoomAction(roomCode, async () => {
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
          message: 'المضيف وحده ينهي الجولة.',
        };
      }
      if (room.status !== 'active') {
        return {
          ok: false,
          code: 'ROUND_NOT_ACTIVE',
          message: 'لا توجد جولة نشطة.',
        };
      }
      const closed = this.closeRound(room);
      await this.saveRoom(roomCode, closed);
      return { ok: true, room: closed };
    });
  }

  async expireRound(
    roomCode: string,
    roundNumber: number,
  ): Promise<EliminationActionResult> {
    return this.executeRoomAction(roomCode, async () => {
      const room = await this.loadRoom(roomCode);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      if (room.status !== 'active' || room.currentRound !== roundNumber) {
        return {
          ok: false,
          code: 'ROUND_MISMATCH',
          message: 'الجولة الحالية غير مطابقة.',
        };
      }
      if (
        room.questionDeadlineAt == null ||
        Date.now() < room.questionDeadlineAt
      ) {
        return {
          ok: false,
          code: 'ROUND_NOT_EXPIRED',
          message: 'وقت الجولة لم ينته بعد.',
        };
      }
      const closed = this.closeRound(room);
      await this.saveRoom(roomCode, closed);
      return { ok: true, room: closed };
    });
  }

  async nextRound(
    roomCode: string,
    hostId: string,
  ): Promise<EliminationActionResult> {
    return this.executeRoomAction(roomCode, async () => {
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
          message: 'المضيف وحده يبدأ الجولة.',
        };
      }
      if (room.status !== 'between') {
        return {
          ok: false,
          code: 'ROUND_NOT_READY',
          message: 'الجولة السابقة لم تُحسم بعد.',
        };
      }
      const survivorsCount = room.players.filter(
        (player) => player.alive,
      ).length;
      if (survivorsCount <= 1 || room.currentRound >= room.totalRounds) {
        const endedAt = Date.now();
        const finished: EliminationRoomRuntime = {
          ...room,
          status: 'finished',
          endedAt,
          updatedAt: endedAt,
        };
        await this.saveRoom(roomCode, finished);
        return { ok: true, room: finished };
      }

      const nextRoom = await this.openRound(room, room.currentRound + 1);
      if (!nextRoom) {
        const endedAt = Date.now();
        const exhausted: EliminationRoomRuntime = {
          ...room,
          status: 'finished',
          endedAt,
          updatedAt: endedAt,
          stopReason: {
            code: 'NO_QUESTIONS_AVAILABLE',
            message: 'نفدت الأسئلة غير المستخدمة لهذه الحلقة.',
          },
        };
        await this.saveRoom(roomCode, exhausted);
        return { ok: true, room: exhausted };
      }

      await this.saveRoom(roomCode, nextRoom);
      return { ok: true, room: nextRoom };
    });
  }

  async finishGame(
    roomCode: string,
    hostId: string,
  ): Promise<EliminationActionResult> {
    return this.executeRoomAction(roomCode, async () => {
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
          message: 'المضيف وحده ينهي الحلقة.',
        };
      }
      if (room.status === 'finished') {
        return { ok: true, room };
      }
      const endedAt = Date.now();
      const finished: EliminationRoomRuntime = {
        ...room,
        status: 'finished',
        endedAt,
        updatedAt: endedAt,
      };
      await this.saveRoom(roomCode, finished);
      return { ok: true, room: finished };
    });
  }

  resolveChampions(room: EliminationRoomRuntime): {
    championId: string | null;
    championName: string | null;
    runnerUpId: string | null;
    runnerUpName: string | null;
  } {
    const survivors = room.players.filter((player) => player.alive);
    const lastEliminated = [...room.players]
      .filter((player) => !player.alive)
      .sort(
        (a, b) =>
          (b.eliminatedAtRound ?? 0) - (a.eliminatedAtRound ?? 0) ||
          b.joinedAt - a.joinedAt,
      );
    const champion = survivors[0] ?? null;
    const runnerUp = lastEliminated[0] ?? null;
    return {
      championId: champion?.id ?? null,
      championName: champion?.name ?? null,
      runnerUpId: runnerUp?.id ?? null,
      runnerUpName: runnerUp?.name ?? null,
    };
  }

  async leaveRoom(
    guestId: string,
    roomCode: string,
  ): Promise<EliminationActionResult> {
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
          message: 'غادر المضيف وانتهت الحلقة.',
        };
      }
      const playerIndex = room.players.findIndex(
        (player) => player.id === guestId,
      );
      if (playerIndex === -1) {
        return {
          ok: false,
          code: 'NOT_IN_ROOM',
          message: 'لست في هذه الحلقة.',
        };
      }
      room.players.splice(playerIndex, 1);
      room.updatedAt = Date.now();
      if (room.players.length === 0) {
        await this.deleteRoom(roomCode);
        return { ok: true, room };
      }
      await this.saveRoom(roomCode, room);
      return { ok: true, room };
    });
  }

  async deleteRoom(roomCode: string): Promise<void> {
    await this.redis.deleteEliminationRoom(roomCode);
    await this.redis.removeActiveEliminationRoomCode(roomCode);
  }

  async validateGuest(
    guestId: string,
    guestToken?: string,
  ): Promise<EliminationGuestIdentity | null> {
    if (!guestToken) return null;
    let identity = await this.getGuestIdentity(guestId);
    if (!identity) {
      const now = Date.now();
      identity = {
        guestId,
        guestToken,
        createdAt: now,
        expiresAt: now + ELIMINATION_TTL_SECONDS * 1000,
      };
      await this.setGuestIdentity(identity);
      return identity;
    }
    if (Date.now() > identity.expiresAt) {
      await this.redis.deleteEliminationGuestIdentity(guestId);
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
  ): Promise<EliminationActionResult> {
    const locked = await this.executeWithRoomLock(roomCode, async () => {
      const room = await this.loadRoom(roomCode);
      if (!room) {
        return {
          ok: false as const,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const isMember =
        room.players.some((player) => player.id === guestId) ||
        room.hostId === guestId;
      if (!isMember) {
        return {
          ok: false as const,
          code: 'NOT_IN_ROOM',
          message: 'لست في هذه الحلقة.',
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
}
