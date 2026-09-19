import { Injectable } from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  type ChessColor,
  type ChessGuestIdentity,
  type ChessMoveEntry,
  type ChessPlayerSeat,
  type ChessResult,
  type ChessRoom,
  type MovePayload,
  CHESS_TIME_CONTROLS,
} from '@tahaddi/domain';
import { RedisService } from '../game/redis.service.js';
import type {
  CreateRoomInput,
  JoinRoomInput,
  SpectateInput,
  ActionResult,
  MoveResult,
} from './chess.types.js';
import {
  CHESS_GUEST_TTL_SECONDS,
  CHESS_MAX_SPECTATORS,
} from './chess.types.js';
import {
  createChessEngine,
  detectDraw,
  validateChessMove,
  STARTING_FEN,
} from './chess.logic.js';

@Injectable()
export class ChessService {
  constructor(private readonly redis: RedisService) {}

  private async loadRoom(pin: string): Promise<ChessRoom | null> {
    return this.redis.loadChessRoom<ChessRoom>(pin);
  }

  async getRoom(pin: string): Promise<ChessRoom | null> {
    return this.loadRoom(pin);
  }

  private async saveRoom(pin: string, room: ChessRoom): Promise<void> {
    await this.redis.saveChessRoom(pin, room);
  }

  private async setGuestIdentity(identity: ChessGuestIdentity): Promise<void> {
    await this.redis.setChessGuestIdentity(
      identity.guestId,
      identity,
      CHESS_GUEST_TTL_SECONDS,
    );
  }

  private async getGuestIdentity(
    guestId: string,
  ): Promise<ChessGuestIdentity | null> {
    return this.redis.getChessGuestIdentity<ChessGuestIdentity>(guestId);
  }

  private async deleteGuestIdentity(guestId: string): Promise<void> {
    await this.redis.deleteChessGuestIdentity(guestId);
  }

  private generatePin(): Promise<string> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tryGenerate = async () => {
        attempts += 1;
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const exists = await this.redis.isChessPinActive(pin);
        if (!exists) return resolve(pin);
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

  buildSnapshot(
    room: ChessRoom,
    viewerGuestId?: string,
  ): {
    pin: string;
    phase: ChessRoom['phase'];
    fen: string;
    turn: ChessColor;
    stateVersion: number;
    moves: ChessMoveEntry[];
    timeControl: ChessRoom['timeControl'];
    whiteClock: ChessRoom['whiteClock'];
    blackClock: ChessRoom['blackClock'];
    serverNow: number;
    seats: {
      white: { name: string; connected: boolean } | null;
      black: { name: string; connected: boolean } | null;
    };
    spectatorCount: number;
    lastMove: ChessRoom['lastMove'];
    result: ChessRoom['result'];
    drawOffer: ChessRoom['drawOffer'];
    isHost: boolean;
    yourColor: ChessColor | null;
    yourRole: 'white' | 'black' | 'spectator';
    yourGuestId?: string;
  } {
    const isHost = viewerGuestId === room.hostGuestId;
    const whiteSeat = room.seats.white;
    const blackSeat = room.seats.black;
    let yourColor: ChessColor | null = null;
    let yourRole: 'white' | 'black' | 'spectator' = 'spectator';
    if (whiteSeat && whiteSeat.guestId === viewerGuestId) {
      yourColor = 'white';
      yourRole = 'white';
    } else if (blackSeat && blackSeat.guestId === viewerGuestId) {
      yourColor = 'black';
      yourRole = 'black';
    }
    return {
      pin: room.pin,
      phase: room.phase,
      fen: room.fen,
      turn: room.turn,
      stateVersion: room.stateVersion,
      moves: room.moves,
      timeControl: room.timeControl,
      whiteClock: room.whiteClock,
      blackClock: room.blackClock,
      seats: {
        white: whiteSeat
          ? { name: whiteSeat.name, connected: whiteSeat.connected }
          : null,
        black: blackSeat
          ? { name: blackSeat.name, connected: blackSeat.connected }
          : null,
      },
      spectatorCount: room.spectatorCount,
      lastMove: room.lastMove,
      result: room.result,
      drawOffer: room.drawOffer,
      serverNow: Date.now(),
      isHost,
      yourColor,
      yourRole,
      yourGuestId: viewerGuestId ?? undefined,
    };
  }

  async executeWithRoomLock<T>(
    pin: string,
    action: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const token = randomUUID();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const acquired = await this.redis.acquireChessRoomLock(pin, token);
      if (acquired) {
        try {
          return { acquired: true, value: await action() };
        } finally {
          await this.redis.releaseChessRoomLock(pin, token);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return { acquired: false };
  }

  private async executeRoomAction(
    pin: string,
    action: () => Promise<ActionResult>,
  ): Promise<ActionResult> {
    const locked = await this.executeWithRoomLock(pin, action);
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
    input: CreateRoomInput,
    hostGuestId: string,
    hostGuestToken: string,
  ): Promise<ActionResult> {
    const pin = await this.generatePin();
    const now = Date.now();
    const colorChoice = input.colorChoice;
    let hostColor: ChessColor = 'white';
    if (colorChoice === 'black') {
      hostColor = 'black';
    } else if (colorChoice === 'random') {
      hostColor = Math.random() < 0.5 ? 'white' : 'black';
    }

    const room: ChessRoom = {
      pin,
      hostGuestId,
      phase: 'waiting',
      fen: STARTING_FEN,
      turn: 'white',
      stateVersion: 0,
      moves: [],
      timeControl: CHESS_TIME_CONTROLS[input.timeControl],
      whiteClock: {
        remainingMs:
          CHESS_TIME_CONTROLS[input.timeControl].initialSeconds * 1000,
      },
      blackClock: {
        remainingMs:
          CHESS_TIME_CONTROLS[input.timeControl].initialSeconds * 1000,
      },
      seats: {
        white:
          hostColor === 'white'
            ? {
                guestId: hostGuestId,
                name: this.normalizeName(input.playerName),
                color: 'white',
                connected: true,
                createdAt: now,
              }
            : null,
        black:
          hostColor === 'black'
            ? {
                guestId: hostGuestId,
                name: this.normalizeName(input.playerName),
                color: 'black',
                connected: true,
                createdAt: now,
              }
            : null,
      },
      spectators: [],
      spectatorCount: 0,
      lastMove: null,
      result: null,
      drawOffer: null,
      createdAt: now,
    };

    await this.saveRoom(pin, room);
    await this.redis.addActiveChessPin(pin);

    const guestIdentity: ChessGuestIdentity = {
      guestId: hostGuestId,
      guestToken: hostGuestToken,
      pin,
      color: hostColor,
      name: this.normalizeName(input.playerName),
      createdAt: now,
      expiresAt: now + CHESS_GUEST_TTL_SECONDS * 1000,
    };
    await this.setGuestIdentity(guestIdentity);

    return { ok: true, room };
  }

  async joinRoom(
    input: JoinRoomInput,
    guestId: string,
    guestToken: string,
  ): Promise<ActionResult> {
    const pin = input.pin;
    const locked = await this.executeWithRoomLock(
      pin,
      async (): Promise<ActionResult> => {
        const room = await this.loadRoom(pin);
        if (!room) {
          return {
            ok: false,
            code: 'ROOM_NOT_FOUND',
            message: 'لم نجد غرفة مفتوحة بهذا الرمز.',
          };
        }
        if (room.phase !== 'waiting' && room.phase !== 'ready') {
          return {
            ok: false,
            code: 'GAME_STARTED',
            message: 'بدأت هذه المباراة بالفعل.',
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

        const existingWhite = room.seats.white;
        const existingBlack = room.seats.black;

        if (existingWhite && existingBlack) {
          return {
            ok: false,
            code: 'ROOM_FULL',
            message: 'اكتمل عدد اللاعبين. يمكنك المشاهدة برمز الغرفة.',
          };
        }

        const existingNames = [existingWhite?.name, existingBlack?.name].filter(
          Boolean,
        ) as string[];
        if (
          existingNames.some(
            (n) => n.toLocaleLowerCase('ar') === name.toLocaleLowerCase('ar'),
          )
        ) {
          return {
            ok: false,
            code: 'NAME_TAKEN',
            message: 'هذا الاسم مستخدم في الغرفة.',
          };
        }

        const now = Date.now();

        let color: ChessColor;
        if (!existingWhite) {
          color = 'white';
          room.seats.white = {
            guestId,
            name,
            color: 'white',
            connected: true,
            createdAt: now,
          };
        } else if (!existingBlack) {
          color = 'black';
          room.seats.black = {
            guestId,
            name,
            color: 'black',
            connected: true,
            createdAt: now,
          };
        } else {
          return {
            ok: false,
            code: 'ROOM_FULL',
            message: 'اكتمل عدد اللاعبين.',
          };
        }

        room.phase = 'ready';
        await this.saveRoom(pin, room);

        const guestIdentity: ChessGuestIdentity = {
          guestId,
          guestToken,
          pin,
          color,
          name,
          createdAt: now,
          expiresAt: now + CHESS_GUEST_TTL_SECONDS * 1000,
        };
        await this.setGuestIdentity(guestIdentity);

        return { ok: true, room };
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

  async spectate(input: SpectateInput): Promise<ActionResult> {
    const pin = input.pin;
    return this.executeRoomAction(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'لم نجد غرفة مفتوحة بهذا الرمز.',
        };
      }
      const spectatorId =
        input.spectatorId ??
        `spectator_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const existingSpectator = room.spectators.some(
        (spectator) => spectator.guestId === spectatorId,
      );
      if (!existingSpectator) {
        if (room.spectators.length >= CHESS_MAX_SPECTATORS) {
          return {
            ok: false,
            code: 'SPECTATOR_LIMIT',
            message: 'اكتمل عدد المشاهدين في هذه الغرفة.',
          };
        }
        room.spectators.push({
          guestId: spectatorId,
          name: input.spectatorName?.trim() || 'مشاهد',
          joinedAt: Date.now(),
        });
        room.spectatorCount = room.spectators.length;
        await this.saveRoom(pin, room);
      }
      return { ok: true, room };
    });
  }

  async startGame(pin: string, guestId: string): Promise<ActionResult> {
    return this.executeRoomAction(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      if (room.hostGuestId !== guestId) {
        return {
          ok: false,
          code: 'NOT_HOST',
          message: 'المضيف وحده يبدأ المباراة.',
        };
      }
      if (room.phase !== 'ready') {
        return {
          ok: false,
          code: 'NOT_READY',
          message: 'الغرفة ليست جاهزة للبدء.',
        };
      }
      if (!room.seats.white || !room.seats.black) {
        return {
          ok: false,
          code: 'NOT_ENOUGH_PLAYERS',
          message: 'تحتاج لاعبان للبدء.',
        };
      }
      room.phase = 'countdown';
      await this.saveRoom(pin, room);
      return { ok: true, room };
    });
  }

  async countdownComplete(pin: string): Promise<ActionResult> {
    return this.executeRoomAction(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      if (room.phase !== 'countdown') {
        return {
          ok: false,
          code: 'NOT_IN_COUNTDOWN',
          message: 'العد التنازلي لم يعد نشطًا.',
        };
      }
      room.phase = 'playing';
      const now = Date.now();
      room.startedAt = now;
      if (room.timeControl.initialSeconds > 0) {
        room.whiteClock.startedAt = now;
      }
      await this.saveRoom(pin, room);
      return { ok: true, room };
    });
  }

  async submitMove(
    guestId: string,
    pin: string,
    payload: MovePayload,
  ): Promise<MoveResult> {
    const room = await this.loadRoom(pin);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: 'الغرفة غير موجودة.',
      };
    }

    const seat = this.findSeat(room, guestId);
    if (!seat) {
      return {
        ok: false,
        code: 'NOT_A_PLAYER',
        message: 'لست لاعبًا في هذه الغرفة.',
      };
    }
    if (room.phase !== 'playing') {
      return {
        ok: false,
        code: 'GAME_NOT_ACTIVE',
        message: 'المباراة غير نشطة حاليًا.',
      };
    }
    if (room.result) {
      return { ok: false, code: 'GAME_FINISHED', message: 'انتهت المباراة.' };
    }
    if (payload.expectedVersion !== room.stateVersion) {
      return {
        ok: false,
        code: 'STALE_POSITION',
        message: 'الوضعية قديمة. يجرى المزامنة.',
        currentStateVersion: room.stateVersion,
        latestFen: room.fen,
      };
    }

    const locked = await this.executeWithRoomLock(pin, async () => {
      const freshRoom = await this.loadRoom(pin);
      if (!freshRoom) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      if (freshRoom.result) {
        return {
          ok: false,
          code: 'GAME_FINISHED',
          message: 'انتهت المباراة.',
        };
      }
      if (freshRoom.phase !== 'playing') {
        return {
          ok: false,
          code: 'GAME_NOT_ACTIVE',
          message: 'المباراة غير نشطة حاليًا.',
        };
      }
      if (payload.expectedVersion !== freshRoom.stateVersion) {
        return {
          ok: false,
          code: 'STALE_POSITION',
          message: 'الوضعية قديمة. يجرى المزامنة.',
          currentStateVersion: freshRoom.stateVersion,
          latestFen: freshRoom.fen,
        };
      }
      const freshSeat = this.findSeat(freshRoom, guestId);
      if (!freshSeat) {
        return {
          ok: false,
          code: 'NOT_A_PLAYER',
          message: 'لست لاعبًا في هذه الغرفة.',
        };
      }
      if (freshSeat.color !== freshRoom.turn) {
        return {
          ok: false,
          code: 'NOT_YOUR_TURN',
          message: 'ليس دورك.',
        };
      }

      if (this.updateActiveClock(freshRoom, Date.now())) {
        await this.saveRoom(pin, freshRoom);
        return {
          ok: false,
          code: 'GAME_FINISHED',
          message: 'انتهى الوقت.',
        };
      }

      const engine = createChessEngine(freshRoom.fen);
      const validation = validateChessMove(
        engine,
        payload.from,
        payload.to,
        payload.promotion,
      );
      if (!validation.ok) {
        return {
          ok: false,
          code: validation.code,
          message: validation.message,
        };
      }

      const moverColor = freshRoom.turn;
      const moverClock =
        moverColor === 'white' ? freshRoom.whiteClock : freshRoom.blackClock;
      const opponentClock =
        moverColor === 'white' ? freshRoom.blackClock : freshRoom.whiteClock;

      const control = freshRoom.timeControl;
      if (control.incrementSeconds > 0) {
        moverClock.remainingMs += control.incrementSeconds * 1000;
      }
      moverClock.startedAt = undefined;
      opponentClock.startedAt =
        control.initialSeconds > 0 ? Date.now() : undefined;

      const newFen = engine.fen();
      const san = validation.san;
      freshRoom.fen = newFen;
      freshRoom.turn = engine.turn() === 'w' ? 'white' : 'black';
      freshRoom.stateVersion += 1;
      freshRoom.moves.push({
        san,
        from: payload.from,
        to: payload.to,
        promotion: payload.promotion,
        fen: newFen,
        timestamp: Date.now(),
        by: moverColor,
      });
      freshRoom.lastMove = { from: payload.from, to: payload.to, san };

      const drawCheck = detectDraw(engine);
      if (engine.isCheckmate()) {
        freshRoom.result = {
          reason: 'checkmate',
          winner: moverColor,
          endedAt: Date.now(),
        };
        freshRoom.phase = 'finished';
        freshRoom.endedAt = Date.now();
      } else if (engine.isStalemate()) {
        freshRoom.result = {
          reason: 'stalemate',
          winner: null,
          endedAt: Date.now(),
        };
        freshRoom.phase = 'finished';
        freshRoom.endedAt = Date.now();
      } else if (drawCheck.isDraw && drawCheck.reason) {
        freshRoom.result = {
          reason: drawCheck.reason as ChessResult['reason'],
          winner: null,
          endedAt: Date.now(),
        };
        freshRoom.phase = 'finished';
        freshRoom.endedAt = Date.now();
      }

      await this.saveRoom(pin, freshRoom);
      return { ok: true, room: freshRoom };
    });

    if (!locked.acquired) {
      return {
        ok: false,
        code: 'ROOM_BUSY',
        message: 'الغرفة مشغولة حاليًا. أعد المحاولة.',
      };
    }

    if (!locked.value.ok) {
      return {
        ok: false,
        code: locked.value.code,
        message: locked.value.message,
      } as MoveResult;
    }

    const r = locked.value as Extract<ActionResult, { ok: true }>;
    const engine = createChessEngine(r.room.fen);
    const isCheckFlag = !r.room.result && engine.isCheck();
    const isCheckmateFlag = r.room.result?.reason === 'checkmate';
    const isStalemateFlag = r.room.result?.reason === 'stalemate';
    const isDrawFlag =
      !!r.room.result &&
      [
        'draw_repetition',
        'draw_fifty_move',
        'draw_insufficient_material',
      ].includes(r.room.result.reason);

    return {
      ok: true,
      san: r.room.lastMove?.san ?? '',
      newFen: r.room.fen,
      newStateVersion: r.room.stateVersion,
      isCheck: isCheckFlag,
      isCheckmate: isCheckmateFlag,
      isStalemate: isStalemateFlag,
      isDraw: isDrawFlag,
      gameEnd: r.room.result
        ? {
            reason: r.room.result.reason,
            winner: r.room.result.winner ?? 'draw',
          }
        : undefined,
    };
  }

  async resign(guestId: string, pin: string): Promise<ActionResult> {
    return this.executeRoomAction(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const seat = this.findSeat(room, guestId);
      if (!seat) {
        return {
          ok: false,
          code: 'NOT_A_PLAYER',
          message: 'لست لاعبًا في هذه الغرفة.',
        };
      }
      if (room.phase !== 'playing') {
        return {
          ok: false,
          code: 'GAME_NOT_ACTIVE',
          message: 'المباراة غير نشطة.',
        };
      }
      if (room.result) {
        return { ok: false, code: 'GAME_FINISHED', message: 'انتهت المباراة.' };
      }
      const winner = seat.color === 'white' ? 'black' : 'white';
      const now = Date.now();
      room.result = { reason: 'resignation', winner, endedAt: now };
      room.phase = 'finished';
      room.endedAt = now;
      room.stateVersion += 1;
      await this.saveRoom(pin, room);
      return { ok: true, room };
    });
  }

  async offerDraw(guestId: string, pin: string): Promise<ActionResult> {
    return this.executeRoomAction(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const seat = this.findSeat(room, guestId);
      if (!seat) {
        return {
          ok: false,
          code: 'NOT_A_PLAYER',
          message: 'لست لاعبًا في هذه الغرفة.',
        };
      }
      if (room.phase !== 'playing') {
        return {
          ok: false,
          code: 'GAME_NOT_ACTIVE',
          message: 'المباراة غير نشطة.',
        };
      }
      if (room.result) {
        return { ok: false, code: 'GAME_FINISHED', message: 'انتهت المباراة.' };
      }
      room.drawOffer = { by: seat.color, at: Date.now() };
      await this.saveRoom(pin, room);
      return { ok: true, room };
    });
  }

  async respondDraw(
    guestId: string,
    pin: string,
    accept: boolean,
  ): Promise<ActionResult> {
    return this.executeRoomAction(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      if (room.result) {
        return {
          ok: false,
          code: 'GAME_FINISHED',
          message: 'انتهت المباراة.',
        };
      }
      if (room.phase !== 'playing') {
        return {
          ok: false,
          code: 'GAME_NOT_ACTIVE',
          message: 'المباراة غير نشطة.',
        };
      }
      const seat = this.findSeat(room, guestId);
      if (!seat) {
        return {
          ok: false,
          code: 'NOT_A_PLAYER',
          message: 'لست لاعبًا في هذه الغرفة.',
        };
      }
      if (!room.drawOffer) {
        return {
          ok: false,
          code: 'NO_DRAW_OFFER',
          message: 'لا يوجد عرض تعادل حالياً.',
        };
      }
      if (!accept) {
        room.drawOffer = null;
        await this.saveRoom(pin, room);
        return { ok: true, room };
      }
      const now = Date.now();
      room.result = {
        reason: 'draw_agreement',
        winner: null,
        endedAt: now,
      };
      room.phase = 'finished';
      room.endedAt = now;
      room.drawOffer = null;
      room.stateVersion += 1;
      await this.saveRoom(pin, room);
      return { ok: true, room };
    });
  }

  async leaveRoom(guestId: string, pin: string): Promise<ActionResult> {
    return this.executeRoomAction(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const activeReconnectablePhase =
        room.phase === 'countdown' || room.phase === 'playing';
      if (activeReconnectablePhase && !room.result) {
        const seat = this.findSeat(room, guestId);
        if (!seat) {
          return {
            ok: false,
            code: 'NOT_IN_ROOM',
            message: 'لست في هذه الغرفة.',
          };
        }
        this.markSeatDisconnected(room, seat, Date.now());
        await this.saveRoom(pin, room);
        return { ok: true, room };
      }
      if (room.hostGuestId === guestId) {
        await this.deleteRoom(pin);
        return {
          ok: false,
          code: 'HOST_LEFT',
          message: 'غادر المضيف وانتهت الغرفة.',
        };
      }
      const white = room.seats.white;
      const black = room.seats.black;
      if (white?.guestId === guestId) {
        room.seats.white = null;
      } else if (black?.guestId === guestId) {
        room.seats.black = null;
      } else {
        return {
          ok: false,
          code: 'NOT_IN_ROOM',
          message: 'لست في هذه الغرفة.',
        };
      }
      if (!room.seats.white && !room.seats.black) {
        await this.deleteRoom(pin);
        return { ok: true, room };
      }
      if (room.phase === 'ready' || room.phase === 'waiting') {
        room.phase = 'waiting';
      }
      await this.saveRoom(pin, room);
      return { ok: true, room };
    });
  }

  async deleteRoom(pin: string): Promise<void> {
    await this.redis.deleteChessRoom(pin);
    await this.redis.removeActiveChessPin(pin);
  }

  async validateGuest(
    guestId: string,
    guestToken?: string,
  ): Promise<ChessGuestIdentity | null> {
    if (!guestToken) return null;
    let identity = await this.getGuestIdentity(guestId);
    if (!identity) {
      const now = Date.now();
      identity = {
        guestId,
        guestToken,
        createdAt: now,
        expiresAt: now + CHESS_GUEST_TTL_SECONDS * 1000,
      };
      await this.setGuestIdentity(identity);
      return identity;
    }
    if (Date.now() > identity.expiresAt) {
      await this.redis.deleteChessGuestIdentity(guestId);
      return null;
    }
    if (identity.guestToken !== guestToken) {
      return null;
    }
    return identity;
  }

  async refreshGuestToken(guestId: string): Promise<string | null> {
    const identity = await this.getGuestIdentity(guestId);
    if (!identity) return null;
    const newToken = this.generateGuestToken();
    identity.guestToken = newToken;
    identity.expiresAt = Date.now() + CHESS_GUEST_TTL_SECONDS * 1000;
    await this.setGuestIdentity(identity);
    return newToken;
  }

  findSeat(room: ChessRoom, guestId: string): ChessPlayerSeat | null {
    const white = room.seats.white;
    const black = room.seats.black;
    if (white?.guestId === guestId) return white;
    if (black?.guestId === guestId) return black;
    return null;
  }

  getSeatColor(room: ChessRoom, guestId: string): ChessColor | null {
    const seat = this.findSeat(room, guestId);
    return seat?.color ?? null;
  }

  private updateActiveClock(room: ChessRoom, now: number): boolean {
    if (
      room.phase !== 'playing' ||
      room.result ||
      room.timeControl.initialSeconds === 0
    ) {
      return false;
    }
    const activeColor = room.turn;
    const clock = activeColor === 'white' ? room.whiteClock : room.blackClock;
    if (!clock.startedAt) return false;

    clock.remainingMs = Math.max(
      0,
      clock.remainingMs - (now - clock.startedAt),
    );
    clock.startedAt = clock.remainingMs > 0 ? now : undefined;
    if (clock.remainingMs > 0) return false;

    const winner = activeColor === 'white' ? 'black' : 'white';
    room.result = { reason: 'timeout', winner, endedAt: now };
    room.phase = 'finished';
    room.endedAt = now;
    room.stateVersion += 1;
    return true;
  }

  private markSeatDisconnected(
    room: ChessRoom,
    seat: ChessPlayerSeat,
    now: number,
  ) {
    const clock = seat.color === 'white' ? room.whiteClock : room.blackClock;
    if (room.turn === seat.color) this.updateActiveClock(room, now);
    clock.startedAt = undefined;
    seat.connected = false;
    seat.disconnectAt = now;
  }

  async tickClocks(pin: string): Promise<ChessRoom | null> {
    const locked = await this.executeWithRoomLock(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room || room.phase !== 'playing' || room.result) return room;

      const now = Date.now();
      const seat = room.seats[room.turn];
      if (!seat) return room;
      if (seat.disconnectAt) {
        if (now - seat.disconnectAt < 60_000) return room;
        const winner = room.turn === 'white' ? 'black' : 'white';
        room.result = { reason: 'disconnect_timeout', winner, endedAt: now };
        room.phase = 'finished';
        room.endedAt = now;
        room.stateVersion += 1;
        await this.saveRoom(pin, room);
        return room;
      }
      const clock = room.turn === 'white' ? room.whiteClock : room.blackClock;
      if (room.timeControl.initialSeconds > 0 && !clock.startedAt) {
        clock.startedAt = now;
      }
      this.updateActiveClock(room, now);
      await this.saveRoom(pin, room);
      return room;
    });
    return locked.acquired ? locked.value : null;
  }

  async handleDisconnect(guestId: string, pin: string): Promise<void> {
    await this.executeWithRoomLock(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) return;
      const seat = this.findSeat(room, guestId);
      if (!seat) return;

      const now = Date.now();
      this.markSeatDisconnected(room, seat, now);
      await this.saveRoom(pin, room);
    });
  }

  async handleReconnect(guestId: string, pin: string): Promise<ActionResult> {
    const locked = await this.executeWithRoomLock(pin, async () => {
      const room = await this.loadRoom(pin);
      if (!room) {
        return {
          ok: false as const,
          code: 'ROOM_NOT_FOUND',
          message: 'الغرفة غير موجودة.',
        };
      }
      const seat = this.findSeat(room, guestId);
      if (!seat) {
        return {
          ok: false as const,
          code: 'NOT_IN_ROOM',
          message: 'لست في هذه الغرفة.',
        };
      }
      seat.connected = true;
      seat.disconnectAt = undefined;
      if (
        room.phase === 'playing' &&
        !room.result &&
        room.turn === seat.color &&
        room.timeControl.initialSeconds > 0
      ) {
        const clock =
          seat.color === 'white' ? room.whiteClock : room.blackClock;
        clock.startedAt = Date.now();
      }
      await this.saveRoom(pin, room);
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
