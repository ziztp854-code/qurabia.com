import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  buildScrambledWordsFragments,
  buildScrambledWordsRoomSnapshot,
  isScrambledWordsWordSolved,
  normalizeArabicWord,
  SCRAMBLED_WORDS_MAX_PLAYERS,
  SCRAMBLED_WORDS_MAX_WORDS_PER_PUZZLE,
  SCRAMBLED_WORDS_POINTS_PER_WORD,
  SCRAMBLED_WORDS_SCORING_POLICY_VERSION,
  SCRAMBLED_WORDS_TTL_SECONDS,
  shuffled,
  type ScrambledWordsPlayer,
  type ScrambledWordsRoundResult,
} from '@tahaddi/domain';
import { RedisService } from '../game/redis.service.js';
import { DatabaseService } from '../game/database.service.js';
import { loadScrambledWordsPuzzles } from './scrambled-words-puzzle-bank.js';
import type {
  CreateScrambledWordsRoomPayload,
  JoinScrambledWordsRoomPayload,
  ScrambledWordsActionResult,
  ScrambledWordsGuestIdentity,
  ScrambledWordsRoomRuntime,
} from './scrambled-words.types.js';

@Injectable()
export class ScrambledWordsService {
  constructor(
    private readonly redis: RedisService,
    private readonly database: DatabaseService,
  ) {}

  private async loadRoom(
    roomCode: string,
  ): Promise<ScrambledWordsRoomRuntime | null> {
    return this.redis.loadScrambledRoom<ScrambledWordsRoomRuntime>(roomCode);
  }

  async getRoom(roomCode: string): Promise<ScrambledWordsRoomRuntime | null> {
    return this.loadRoom(roomCode);
  }

  private async saveRoom(
    roomCode: string,
    room: ScrambledWordsRoomRuntime,
  ): Promise<void> {
    await this.redis.saveScrambledRoom(roomCode, room);
  }

  private async setGuestIdentity(
    identity: ScrambledWordsGuestIdentity,
  ): Promise<void> {
    await this.redis.setScrambledGuestIdentity(
      identity.guestId,
      identity,
      24 * 60 * 60,
    );
  }

  private async getGuestIdentity(
    guestId: string,
  ): Promise<ScrambledWordsGuestIdentity | null> {
    return this.redis.getScrambledGuestIdentity<ScrambledWordsGuestIdentity>(
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
        const exists = await this.redis.isScrambledRoomCodeActive(code);
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

  private async openRound(
    room: ScrambledWordsRoomRuntime,
    roundNumber: number,
  ): Promise<ScrambledWordsRoomRuntime | null> {
    const remainingIds = room.puzzleOrder.filter(
      (id) => !room.usedPuzzleIds.includes(id),
    );
    const puzzleId = remainingIds[0];
    if (!puzzleId) return null;

    const bank = await loadScrambledWordsPuzzles(this.database);
    const puzzle = bank.find((candidate) => candidate.id === puzzleId);
    if (!puzzle) return null;

    const openedAt = Date.now();
    const wordCount = Math.min(
      puzzle.words.length,
      SCRAMBLED_WORDS_MAX_WORDS_PER_PUZZLE,
    );
    const words = puzzle.words.slice(0, wordCount);

    return {
      ...room,
      status: 'active',
      currentRound: roundNumber,
      currentPuzzle: { id: puzzle.id, imageUrl: puzzle.imageUrl, words },
      currentFragments: buildScrambledWordsFragments(words),
      puzzleOpenedAt: openedAt,
      puzzleDeadlineAt: openedAt + room.roundTimeLimit * 1000,
      usedPuzzleIds: [...room.usedPuzzleIds, puzzle.id],
      players: room.players.map((player) => ({
        ...player,
        roundScore: 0,
        solvedWords: [],
        finished: false,
      })),
      lastRoundWords: [],
      lastRoundResults: [],
      stopReason: undefined,
      updatedAt: openedAt,
    };
  }

  buildSnapshot(
    room: ScrambledWordsRoomRuntime,
    viewerPlayerId: string | null,
    viewerHostId: string | null,
    now = Date.now(),
  ) {
    const isHost = viewerHostId != null && viewerHostId === room.hostId;
    return buildScrambledWordsRoomSnapshot(room, viewerPlayerId, isHost, now);
  }

  private async executeWithRoomLock<T>(
    roomCode: string,
    action: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const token = randomUUID();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const acquired = await this.redis.acquireScrambledRoomLock(
        roomCode,
        token,
      );
      if (acquired) {
        try {
          return { acquired: true, value: await action() };
        } finally {
          await this.redis.releaseScrambledRoomLock(roomCode, token);
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
    input: CreateScrambledWordsRoomPayload,
    hostId: string,
  ): Promise<ScrambledWordsActionResult> {
    const puzzles = await loadScrambledWordsPuzzles(this.database);
    if (puzzles.length === 0) {
      return {
        ok: false,
        code: 'NO_PUZZLES_AVAILABLE',
        message:
          'لا توجد ألغاز منشورة بعد. أضف الألغاز عبر سكربت التغذية ثم أعد المحاولة.',
      };
    }

    const roomCode = await this.generateRoomCode();
    const now = Date.now();
    const room: ScrambledWordsRoomRuntime = {
      roomCode,
      hostId,
      status: 'waiting',
      totalRounds: input.totalRounds,
      currentRound: 0,
      roundTimeLimit: input.roundTimeLimit,
      firstFinish: input.firstFinish,
      puzzleOrder: shuffled(puzzles.map((puzzle) => puzzle.id)),
      usedPuzzleIds: [],
      currentPuzzle: null,
      currentFragments: null,
      puzzleOpenedAt: null,
      puzzleDeadlineAt: null,
      players: [],
      lastRoundWords: [],
      lastRoundResults: [],
      createdAt: now,
      updatedAt: now,
      scoringPolicyVersion: SCRAMBLED_WORDS_SCORING_POLICY_VERSION,
    };

    await this.saveRoom(roomCode, room);
    await this.redis.addActiveScrambledRoomCode(roomCode);
    return { ok: true, room };
  }

  async joinRoom(
    input: JoinScrambledWordsRoomPayload,
    guestId: string,
    guestToken: string,
  ): Promise<ScrambledWordsActionResult> {
    const roomCode = input.roomCode.toUpperCase();
    const locked = await this.executeWithRoomLock(
      roomCode,
      async (): Promise<ScrambledWordsActionResult> => {
        const room = await this.loadRoom(roomCode);
        if (!room) {
          return {
            ok: false,
            code: 'ROOM_NOT_FOUND',
            message: 'لم نجد غرفة مفتوحة بهذا الرمز.',
          };
        }
        if (room.status === 'active') {
          return {
            ok: false,
            code: 'GAME_STARTED',
            message: 'بدأت الجولة الحالية بالفعل. انتظر الجولة القادمة.',
          };
        }
        if (room.status === 'finished') {
          return {
            ok: false,
            code: 'GAME_FINISHED',
            message: 'انتهت هذه اللعبة.',
          };
        }
        if (room.players.length >= SCRAMBLED_WORDS_MAX_PLAYERS) {
          return {
            ok: false,
            code: 'ROOM_FULL',
            message: 'اكتمل عدد اللاعبين في هذه الغرفة.',
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
            message: 'هذا الاسم مستخدم في الغرفة.',
          };
        }

        const now = Date.now();
        const updatedRoom: ScrambledWordsRoomRuntime = {
          ...room,
          players: [
            ...room.players,
            {
              id: guestId,
              name,
              score: 0,
              roundScore: 0,
              solvedWords: [],
              finished: false,
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
          expiresAt: now + SCRAMBLED_WORDS_TTL_SECONDS * 1000,
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
  ): Promise<ScrambledWordsActionResult> {
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
          message: 'المضيف وحده يبدأ اللعبة.',
        };
      }
      if (room.status === 'active') {
        return {
          ok: false,
          code: 'ALREADY_ACTIVE',
          message: 'الجولة الحالية تعمل بالفعل.',
        };
      }
      if (room.players.length === 0) {
        return {
          ok: false,
          code: 'NOT_ENOUGH_PLAYERS',
          message: 'انضم لاعب واحد على الأقل قبل البدء.',
        };
      }

      const startedAt = room.startedAt ?? Date.now();
      const nextRoom = await this.openRound(
        { ...room, status: 'waiting', startedAt, usedPuzzleIds: [] },
        1,
      );
      if (!nextRoom) {
        return {
          ok: false,
          code: 'NO_PUZZLES_AVAILABLE',
          message: 'لا توجد ألغاز متاحة لهذه الغرفة.',
        };
      }
      await this.saveRoom(roomCode, nextRoom);
      return { ok: true, room: nextRoom };
    });
  }

  async nextRound(
    roomCode: string,
    hostId: string,
  ): Promise<ScrambledWordsActionResult> {
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
      if (room.status !== 'waiting') {
        return {
          ok: false,
          code: 'ROUND_NOT_READY',
          message: 'الجولة الحالية ما زالت تعمل.',
        };
      }
      if (room.currentRound >= room.totalRounds) {
        return {
          ok: false,
          code: 'GAME_FINISHED',
          message: 'اكتملت جولات هذه اللعبة.',
        };
      }

      const nextRoom = await this.openRound(room, room.currentRound + 1);
      if (!nextRoom) {
        const endedAt = Date.now();
        const exhausted: ScrambledWordsRoomRuntime = {
          ...room,
          status: 'finished',
          endedAt,
          updatedAt: endedAt,
          stopReason: {
            code: 'NO_PUZZLES_AVAILABLE',
            message: 'نفدت الألغاز غير المستخدمة لهذه الغرفة.',
          },
        };
        await this.saveRoom(roomCode, exhausted);
        return { ok: true, room: exhausted };
      }

      await this.saveRoom(roomCode, nextRoom);
      return { ok: true, room: nextRoom };
    });
  }

  async submitWord(
    guestId: string,
    roomCode: string,
    puzzleId: string,
    word: string,
    submissionId: string,
  ): Promise<
    | {
        ok: true;
        room: ScrambledWordsRoomRuntime;
        accepted: {
          submissionId: string;
          puzzleId: string;
          word: string;
          points: number;
          totalScore: number;
          solvedWords: string[];
          finished: boolean;
        };
      }
    | { ok: false; code: string; message: string; submissionId?: string }
  > {
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
      if (!room.currentPuzzle || room.currentPuzzle.id !== puzzleId) {
        return fail('PUZZLE_MISMATCH', 'اللغز الحالي غير مطابق.');
      }
      if (
        room.puzzleDeadlineAt != null &&
        Date.now() >= room.puzzleDeadlineAt
      ) {
        return fail('ROUND_EXPIRED', 'انتهى وقت هذه الجولة.');
      }

      const player = room.players.find((candidate) => candidate.id === guestId);
      if (!player) {
        return fail('NOT_A_PLAYER', 'لست لاعبًا في هذه الغرفة.');
      }

      const matchedWord = room.currentPuzzle.words.find(
        (candidate) =>
          !isScrambledWordsWordSolved(candidate, player.solvedWords) &&
          normalizeArabicWord(candidate) === normalizeArabicWord(word),
      );
      if (!matchedWord) {
        return fail('WORD_NOT_MATCHED', 'هذه الكلمة غير صحيحة أو محلولة.');
      }

      const now = Date.now();
      const updatedPlayer: ScrambledWordsPlayer = {
        ...player,
        solvedWords: [...player.solvedWords, matchedWord],
        roundScore: player.roundScore + SCRAMBLED_WORDS_POINTS_PER_WORD,
        score: player.score + SCRAMBLED_WORDS_POINTS_PER_WORD,
      };
      const solvedAll =
        updatedPlayer.solvedWords.length >= room.currentPuzzle.words.length;
      updatedPlayer.finished = solvedAll;

      const players = room.players.map((candidate) =>
        candidate.id === guestId ? updatedPlayer : candidate,
      );

      let updatedRoom: ScrambledWordsRoomRuntime = {
        ...room,
        players,
        updatedAt: now,
      };

      if (solvedAll && room.firstFinish) {
        updatedRoom = this.closeRound(updatedRoom);
      }

      await this.saveRoom(roomCode, updatedRoom);
      return {
        ok: true as const,
        room: updatedRoom,
        accepted: {
          submissionId,
          puzzleId,
          word: matchedWord,
          points: SCRAMBLED_WORDS_POINTS_PER_WORD,
          totalScore: updatedPlayer.score,
          solvedWords: [...updatedPlayer.solvedWords],
          finished: updatedPlayer.finished,
        },
      };
    });
  }

  private captureRoundResults(room: ScrambledWordsRoomRuntime): {
    results: ScrambledWordsRoundResult[];
    words: string[];
  } {
    const results: ScrambledWordsRoundResult[] = room.players
      .map((player) => ({
        id: player.id,
        name: player.name,
        roundScore: player.roundScore,
        totalScore: player.score,
      }))
      .sort(
        (a, b) => b.roundScore - a.roundScore || b.totalScore - a.totalScore,
      );
    return { results, words: room.currentPuzzle?.words ?? [] };
  }

  private closeRound(
    room: ScrambledWordsRoomRuntime,
  ): ScrambledWordsRoomRuntime {
    const { results, words } = this.captureRoundResults(room);
    const isLastRound = room.currentRound >= room.totalRounds;
    const now = Date.now();
    return {
      ...room,
      status: isLastRound ? 'finished' : 'waiting',
      currentPuzzle: null,
      currentFragments: null,
      puzzleOpenedAt: null,
      puzzleDeadlineAt: null,
      lastRoundWords: words,
      lastRoundResults: results,
      ...(isLastRound ? { endedAt: now } : {}),
      updatedAt: now,
    };
  }

  async endRound(
    roomCode: string,
    hostId: string,
  ): Promise<ScrambledWordsActionResult> {
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
  ): Promise<ScrambledWordsActionResult> {
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
      if (room.puzzleDeadlineAt == null || Date.now() < room.puzzleDeadlineAt) {
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

  async finishGame(
    roomCode: string,
    hostId: string,
  ): Promise<ScrambledWordsActionResult> {
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
          message: 'المضيف وحده ينهي اللعبة.',
        };
      }
      if (room.status === 'finished') {
        return { ok: true, room };
      }
      const endedAt = Date.now();
      const finished: ScrambledWordsRoomRuntime = {
        ...room,
        status: 'finished',
        endedAt,
        updatedAt: endedAt,
      };
      await this.saveRoom(roomCode, finished);
      return { ok: true, room: finished };
    });
  }

  async leaveRoom(
    guestId: string,
    roomCode: string,
  ): Promise<ScrambledWordsActionResult> {
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
      const playerIndex = room.players.findIndex(
        (player) => player.id === guestId,
      );
      if (playerIndex === -1) {
        return {
          ok: false,
          code: 'NOT_IN_ROOM',
          message: 'لست في هذه الغرفة.',
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
    await this.redis.deleteScrambledRoom(roomCode);
    await this.redis.removeActiveScrambledRoomCode(roomCode);
  }

  async validateGuest(
    guestId: string,
    guestToken?: string,
  ): Promise<ScrambledWordsGuestIdentity | null> {
    if (!guestToken) return null;
    let identity = await this.getGuestIdentity(guestId);
    if (!identity) {
      const now = Date.now();
      identity = {
        guestId,
        guestToken,
        createdAt: now,
        expiresAt: now + SCRAMBLED_WORDS_TTL_SECONDS * 1000,
      };
      await this.setGuestIdentity(identity);
      return identity;
    }
    if (Date.now() > identity.expiresAt) {
      await this.redis.deleteScrambledGuestIdentity(guestId);
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
  ): Promise<ScrambledWordsActionResult> {
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
}
