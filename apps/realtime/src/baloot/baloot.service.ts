import { Injectable, Optional } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  applyRoundToMatch,
  advanceContractMultiplier,
  BALOOT_RULES,
  createDeck,
  detectProjects,
  getTrickWinner,
  hasBaloot,
  scoreRound,
  selectTimeoutPlay,
  validateCardMove,
  shuffleDeck,
  type RandomSource,
  type Team,
} from '@tahaddi/domain';
import { RedisService } from '../game/redis.service.js';
import type {
  BalootBid,
  BalootCard,
  BalootContractState,
  BalootFailure,
  BalootResult,
  BalootRoom,
  BalootSession,
  BalootSnapshot,
  BalootSuit,
  BidBalootPayload,
  CreateBalootRoomPayload,
  JoinBalootRoomPayload,
  PlayBalootCardPayload,
  ReconnectBalootPayload,
  SerializedBalootRoom,
} from './baloot.types.js';

const MAX_PLAYERS = 4;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Tahaddi-specific suit names. The engine never reads these strings; the
 * UI is the only place that touches them, so renaming them later is a
 * pure-display change.
 */
export const TAHADDI_SUIT_LABELS: Record<
  BalootSuit,
  { name: string; glyph: string }
> = {
  spades: { name: 'السبيت', glyph: '♠' },
  hearts: { name: 'الشيريا', glyph: '♥' },
  clubs: { name: 'الهاص', glyph: '♣' },
  diamonds: { name: 'الديمن', glyph: '♦' },
};

/**
 * The auction engine. Centralises the rule "which bids are legal in the
 * current state?" so the service layer can:
 *   1) filter invalid incoming bids,
 *   2) send a `BalootSnapshot.availableBids` list to clients so the UI
 *      renders only the buttons that are actually usable.
 *
 * The rules implemented:
 *   - Round 1: every player can pass, bid SUN, bid HOKUM in any suit.
 *   - "أشكل" (ashkal) is a partner-challenge bid; only legal for the
 *     partner of the current declarer (i.e. not for the declarer
 *     themselves) and only when an active contract exists.
 *   - Round 2 ("حكم ثاني"): opened when all four players pass in round 1.
 *     In round 2 SUN is locked out and only HOKUM is legal.
 *   - Doubling happens in the dedicated `DOUBLING` phase that opens as
 *     soon as the auction closes. Only the team that has not yet touched
 *     the multiplier can double, and doubling is always the first thing
 *     the opponent team sees after a contract is set.
 */
function computeAvailableBids(
  room: BalootRoom,
  seatIndex: number,
): BalootBid[] {
  if (seatIndex < 0 || seatIndex >= MAX_PLAYERS) return [];
  if (room.seats[seatIndex] === null) return [];

  if (room.phase === 'DOUBLING') {
    const accept: BalootBid = { mode: 'accept' };
    if (room.pendingDouble === null) {
      const declarer = room.contract?.buyerSeat ?? seatIndex;
      const declarerTeam = declarer % 2;
      if (seatIndex % 2 === declarerTeam) return [];
      const canDoubleSun =
        room.contract?.mode.mode !== 'sun' ||
        (room.scores[0] > BALOOT_RULES.sunDoubleScores.above &&
          room.scores[1] < BALOOT_RULES.sunDoubleScores.below) ||
        (room.scores[1] > BALOOT_RULES.sunDoubleScores.above &&
          room.scores[0] < BALOOT_RULES.sunDoubleScores.below);
      return canDoubleSun
        ? [accept, { mode: 'double', play: 'open' }]
        : [accept];
    }
    if (room.contract?.mode.mode === 'sun') return [accept];
    if (room.contract?.multiplier === 2) return [accept, { mode: 'triple' }];
    if (room.contract?.multiplier === 3) {
      return [accept, { mode: 'quadruple', play: 'open' }];
    }
    return [accept];
  }

  if (room.phase !== 'BIDDING') return [];
  if (room.bidder !== seatIndex) return [];

  const options: BalootBid[] = [{ mode: 'pass' }];

  if (room.auctionRound === 1) {
    // Hokum in every suit + sun + (when there is a partner-declarer) ashkal.
    for (const suit of BALOOT_RULES.suits) {
      options.push({ mode: 'hokum', trump: suit });
    }
    options.push({ mode: 'sun' });
    const contract = room.contract;
    if (
      contract &&
      contract.buyerSeat !== seatIndex &&
      // Partner of the declarer: seats 0/2 are team A, 1/3 are team B.
      contract.buyerSeat % 2 !== seatIndex % 2 &&
      // Only when the current bidder is the partner, not a stranger.
      ((contract.buyerSeat + 2) % MAX_PLAYERS === seatIndex ||
        (seatIndex + 2) % MAX_PLAYERS === contract.buyerSeat)
    ) {
      options.push({ mode: 'ashkal' });
    }
  } else {
    // Round 2 ("حكم ثاني"): SUN is locked out; only HOKUM bids.
    for (const suit of BALOOT_RULES.suits) {
      options.push({ mode: 'hokum', trump: suit });
    }
  }

  return options;
}

/**
 * True when two `BalootBid` values describe the same logical offer, so the
 * service can compare the incoming payload against the server's authoritative
 * list produced by `computeAvailableBids`.
 */
function bidsMatch(a: BalootBid, b: BalootBid): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'hokum' && b.mode === 'hokum') return a.trump === b.trump;
  if (a.mode === 'double' && b.mode === 'double') return a.play === b.play;
  if (a.mode === 'quadruple' && b.mode === 'quadruple')
    return a.play === b.play;
  return true;
}

/**
 * Returns the seat of the opposing team that is currently connected,
 * starting from the seat right after `declarerSeat`. Used to hand the
 * DOUBLING action to the opponent after a contract is set, and to route
 * the doubling decision after a level-1 double.
 */
function findOpposingPlayer(room: BalootRoom, declarerSeat: number): number {
  const declarerTeam = declarerSeat % 2;
  for (let offset = 1; offset < MAX_PLAYERS; offset += 1) {
    const candidate = (declarerSeat + offset) % MAX_PLAYERS;
    if (room.seats[candidate] && candidate % 2 !== declarerTeam) {
      return candidate;
    }
  }
  return -1;
}

/**
 * Closes the auction and transitions the table into PLAYING. The
 * declarer's seat becomes the leader and the first to play. The buyer
 * (which may differ from the declarer when ashkal was used) becomes the
 * round's "owner" for scoring purposes.
 */
function startPlay(room: BalootRoom): void {
  if (!room.contract) return;
  const contract = room.contract.mode;
  room.projectDeclarations = room.seats.flatMap((seat) =>
    seat
      ? detectProjects(seat.hand).map((project) => ({
          team: (seat.seat % 2) as Team,
          declarationOrder:
            (seat.seat - room.leaderSeat + MAX_PLAYERS) % MAX_PLAYERS,
          project,
        }))
      : [],
  );
  room.balootTeams =
    contract.mode === 'hokum'
      ? [
          ...new Set(
            room.seats.flatMap((seat) =>
              seat && hasBaloot(seat.hand, contract.trump)
                ? [(seat.seat % 2) as Team]
                : [],
            ),
          ),
        ]
      : [];
  room.phase = 'PLAYING';
  room.turn = room.leaderSeat;
  room.bidder = room.leaderSeat;
  room.pendingDouble = null;
  room.passCount = 0;
}

@Injectable()
export class BalootService {
  private readonly rooms = new Map<string, BalootRoom>();
  private readonly sessionRooms = new Map<string, string>();

  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly random: RandomSource = Math.random,
  ) {}

  async createRoom(
    input: CreateBalootRoomPayload,
  ): Promise<BalootResult<BalootSession>> {
    await this.removeExpiredRooms();
    const playerName = this.normalizeName(input.playerName);
    if (!playerName) return this.invalidName();

    const roomCode = await this.createRoomCode();
    const sessionToken = this.createSessionToken();
    const room: BalootRoom = {
      roomCode,
      phase: 'LOBBY',
      stateVersion: 1,
      seats: [
        {
          seat: 0,
          team: 'A',
          playerName,
          ready: false,
          connected: true,
          isHost: true,
          sessionToken,
          hand: [],
        },
        null,
        null,
        null,
      ],
      contract: null,
      lastContract: null,
      bidder: 0,
      buyerPlayerId: 0,
      passCount: 0,
      bidLog: [],
      auctionRound: 1,
      turn: null,
      currentTrick: [],
      trickHistory: [],
      scores: [0, 0],
      pendingDouble: null,
      leaderSeat: 0,
      roundScore: null,
      projectDeclarations: [],
      balootTeams: [],
      autoPlayEvents: [],
      processedCommands: new Set(),
      createdAt: Date.now(),
      expiresAt: Date.now() + ROOM_TTL_MS,
    };
    this.rooms.set(roomCode, room);
    this.sessionRooms.set(sessionToken, roomCode);
    await this.persist(room);
    await this.indexSession(sessionToken, roomCode);
    return { ok: true, data: this.buildSession(room, sessionToken) };
  }

  async joinRoom(
    input: JoinBalootRoomPayload,
  ): Promise<BalootResult<BalootSession>> {
    await this.removeExpiredRooms();
    const roomCode = this.normalizeRoomCode(input.roomCode);
    const existingToken = input.sessionToken?.trim() ?? '';
    if (existingToken) {
      const resumed = await this.resume(existingToken);
      if (resumed.ok && resumed.data.roomCode === roomCode) return resumed;
    }

    return this.withRoomLock(roomCode, async () => {
      const room = await this.resolveRoom(roomCode);
      if (!room) return this.failure('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
      if (room.phase !== 'LOBBY' && room.phase !== 'READY') {
        return this.failure('GAME_STARTED', 'بدأت المباراة بالفعل.');
      }
      const playerName = this.normalizeName(input.playerName);
      if (!playerName) return this.invalidName();
      const namedSeat = room.seats.find(
        (seat) => seat?.playerName === playerName,
      );
      if (namedSeat) {
        if (!namedSeat.connected) {
          namedSeat.connected = true;
          room.stateVersion += 1;
          this.syncLobbyPhase(room);
          await this.persist(room);
          await this.indexSession(namedSeat.sessionToken, roomCode);
          return {
            ok: true as const,
            data: this.buildSession(room, namedSeat.sessionToken),
          };
        }
        return this.failure('NAME_TAKEN', 'الاسم مستخدم في الغرفة.');
      }
      const seatIndex = this.findOpenSeatIndex(room);
      if (seatIndex < 0) {
        return this.failure('ROOM_FULL', 'اكتملت مقاعد البلوت الأربعة.');
      }

      const previous = room.seats[seatIndex];
      if (previous) {
        this.sessionRooms.delete(previous.sessionToken);
        await this.deleteSession(previous.sessionToken);
      }

      const sessionToken = this.createSessionToken();
      room.seats[seatIndex] = {
        seat: seatIndex,
        team: seatIndex % 2 === 0 ? 'A' : 'B',
        playerName,
        ready: false,
        connected: true,
        isHost: false,
        sessionToken,
        hand: [],
      };
      room.stateVersion += 1;
      this.syncLobbyPhase(room);
      this.sessionRooms.set(sessionToken, roomCode);
      await this.persist(room);
      await this.indexSession(sessionToken, roomCode);
      return { ok: true as const, data: this.buildSession(room, sessionToken) };
    });
  }

  async setReady(
    roomCode: string,
    sessionToken: string,
    ready: boolean,
  ): Promise<BalootResult<BalootSession>> {
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return found;
      if (!['LOBBY', 'READY'].includes(found.room.phase)) {
        return this.failure('INVALID_PHASE', 'لا يمكن تغيير الجاهزية الآن.');
      }
      found.seat.ready = ready;
      this.syncLobbyPhase(found.room);
      found.room.stateVersion += 1;
      await this.persist(found.room);
      return {
        ok: true as const,
        data: this.buildSession(found.room, sessionToken),
      };
    });
  }

  async startGame(
    roomCode: string,
    sessionToken: string,
  ): Promise<BalootResult<BalootSession>> {
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return found;
      if (!found.seat.isHost)
        return this.failure('NOT_HOST', 'المضيف وحده يبدأ اللعب.');
      const occupied = this.occupiedSeats(found.room);
      if (
        occupied.length !== MAX_PLAYERS ||
        occupied.some((seat) => !seat.ready)
      ) {
        return this.failure('NOT_READY', 'يجب اكتمال أربعة لاعبين وجاهزيتهم.');
      }

      this.dealRound(found.room, 0);
      await this.persist(found.room);
      return {
        ok: true as const,
        data: this.buildSession(found.room, sessionToken),
      };
    });
  }

  async nextRound(
    roomCode: string,
    sessionToken: string,
  ): Promise<BalootResult<BalootSession>> {
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return found;
      if (!found.seat.isHost)
        return this.failure('NOT_HOST', 'المضيف وحده يبدأ الصكة التالية.');
      if (found.room.phase !== 'ROUND_RESULT')
        return this.failure('INVALID_PHASE', 'الصكة الحالية لم تنته بعد.');
      this.dealRound(found.room, (found.room.bidder + 1) % MAX_PLAYERS);
      await this.persist(found.room);
      return {
        ok: true as const,
        data: this.buildSession(found.room, sessionToken),
      };
    });
  }

  async bid(
    roomCode: string,
    sessionToken: string,
    payload: BidBalootPayload,
  ): Promise<BalootResult<BalootSession>> {
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return found;
      const commandError = this.validateCommand(found.room, payload);
      if (commandError) return commandError;
      if (found.room.phase !== 'BIDDING' && found.room.phase !== 'DOUBLING') {
        return this.failure('INVALID_PHASE', 'المزايدة غير نشطة.');
      }
      if (found.seat.seat !== found.room.bidder) {
        return this.failure('NOT_YOUR_TURN', 'الدور لمزايد آخر.');
      }
      if (!this.isBid(payload.bid)) {
        return this.failure('INVALID_BID', 'العقد المرسل غير صالح.');
      }
      if (payload.bid.mode === 'gahwa') {
        return this.failure(
          'UNSUPPORTED_GAHWA',
          'القهوة مؤجلة حتى تكتمل قواعد حسم المباراة.',
        );
      }
      if (
        (payload.bid.mode === 'double' || payload.bid.mode === 'quadruple') &&
        payload.bid.play === 'locked'
      ) {
        return this.failure(
          'UNSUPPORTED_LOCKED',
          'اللعب المقفول مؤجل حتى تكتمل قواعد قيادة الحكم.',
        );
      }
      // Re-validate against the live availableBids list so the engine
      // remains the single source of truth for "is this legal?".
      const legal = computeAvailableBids(found.room, found.seat.seat);
      if (!legal.some((option) => bidsMatch(option, payload.bid!))) {
        return this.failure(
          'ILLEGAL_BID',
          'هذا الخيار غير متاح في هذه المرحلة.',
        );
      }

      found.room.processedCommands.add(payload.commandId!);

      if (payload.bid.mode === 'accept') {
        startPlay(found.room);
        found.room.stateVersion += 1;
        await this.persist(found.room);
        return {
          ok: true as const,
          data: this.buildSession(found.room, sessionToken),
        };
      }

      if (
        payload.bid.mode === 'double' ||
        payload.bid.mode === 'triple' ||
        payload.bid.mode === 'quadruple'
      ) {
        const currentContract = found.room.contract!;
        const next = advanceContractMultiplier({
          contract: currentContract.mode,
          current: currentContract.multiplier,
          matchScores: found.room.scores,
        });
        if (next === 'gahwa') {
          return this.failure(
            'UNSUPPORTED_GAHWA',
            'القهوة غير مفعلة في هذا الفرع.',
          );
        }
        found.room.contract = { ...currentContract, multiplier: next };
        found.room.pendingDouble = {
          fromSeat: found.seat.seat,
          announcement: payload.bid.mode,
        };
        const opponent = findOpposingPlayer(found.room, found.seat.seat);
        if (opponent < 0) startPlay(found.room);
        else found.room.bidder = opponent;
        found.room.stateVersion += 1;
        await this.persist(found.room);
        return {
          ok: true as const,
          data: this.buildSession(found.room, sessionToken),
        };
      }

      // Regular auction path.
      found.room.bidLog.push({
        seat: found.seat.seat,
        bid: { ...payload.bid },
        auctionRound: found.room.auctionRound,
      });

      if (payload.bid.mode === 'pass') {
        found.room.bidder = (found.room.bidder + 1) % MAX_PLAYERS;
        found.room.passCount += 1;
        if (found.room.passCount === MAX_PLAYERS) {
          if (found.room.auctionRound === 1) {
            // Open the second round ("حكم ثاني") — the bidder keeps
            // the same position (next to the dealer) so the rotation
            // resumes from the same seat.
            found.room.auctionRound = 2;
            found.room.passCount = 0;
            found.room.contract = null;
            found.room.lastContract = null;
          } else {
            // Second round also passed out: redeal to the next dealer.
            this.dealRound(found.room, (found.room.bidder + 1) % MAX_PLAYERS);
            await this.persist(found.room);
            return {
              ok: true as const,
              data: this.buildSession(found.room, sessionToken),
            };
          }
        }
      } else if (payload.bid.mode === 'ashkal') {
        // The partner of the current declarer takes over the contract
        // without changing its mode or trump; the buyer and the leader
        // both move to the partner.
        const existing = found.room.contract;
        if (!existing) {
          return this.failure('ILLEGAL_BID', 'لا يوجد عقد لتحدّيه بأشكل.');
        }
        const partner = (found.seat.seat + 2) % MAX_PLAYERS;
        const ashkal: BalootContractState = {
          ...existing,
          buyerSeat: partner,
          declaredBySeat: existing.buyerSeat,
        };
        found.room.contract = ashkal;
        found.room.lastContract = ashkal;
        found.room.buyerPlayerId = partner;
        // The ashkal player leads the first trick.
        found.room.leaderSeat = partner;
        found.room.passCount = 0;
        // Open the doubling phase so the opponent can react to the
        // new contract. The opponent team gets the first action.
        found.room.phase = 'DOUBLING';
        found.room.bidder = findOpposingPlayer(found.room, partner);
        found.room.pendingDouble = null;
      } else {
        // A new contract offer (sun or hokum). The auction continues;
        // a 3-pass run after a contract will close the bidding.
        const contract: BalootContractState =
          payload.bid.mode === 'sun'
            ? {
                mode: { mode: 'sun' as const },
                multiplier: 1,
                buyerSeat: found.seat.seat,
                declaredBySeat: found.seat.seat,
                auctionRound: found.room.auctionRound,
              }
            : {
                mode: { mode: 'hokum' as const, trump: payload.bid.trump },
                multiplier: 1,
                buyerSeat: found.seat.seat,
                declaredBySeat: found.seat.seat,
                auctionRound: found.room.auctionRound,
              };
        found.room.contract = contract;
        found.room.lastContract = contract;
        found.room.buyerPlayerId = found.seat.seat;
        // The buyer leads the first trick when the auction closes.
        found.room.leaderSeat = found.seat.seat;
        found.room.passCount = 0;
        found.room.bidder = (found.room.bidder + 1) % MAX_PLAYERS;
      }

      // Standard close: when 3 consecutive passes follow a contract,
      // open the DOUBLING phase.
      if (
        found.room.phase === 'BIDDING' &&
        found.room.contract &&
        found.room.passCount === MAX_PLAYERS - 1
      ) {
        found.room.passCount = 0;
        found.room.phase = 'DOUBLING';
        found.room.bidder = findOpposingPlayer(
          found.room,
          found.room.buyerPlayerId,
        );
      }
      found.room.stateVersion += 1;
      await this.persist(found.room);
      return {
        ok: true as const,
        data: this.buildSession(found.room, sessionToken),
      };
    });
  }

  async playCard(
    roomCode: string,
    sessionToken: string,
    payload: PlayBalootCardPayload,
  ): Promise<BalootResult<BalootSession>> {
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return found;
      const commandError = this.validateCommand(found.room, payload);
      if (commandError) return commandError;
      if (found.room.phase !== 'PLAYING' || !found.room.contract) {
        return this.failure('INVALID_PHASE', 'اللعب غير نشط.');
      }
      if (found.room.turn !== found.seat.seat) {
        return this.failure('NOT_YOUR_TURN', 'ليس دورك.');
      }
      const cardIndex = found.seat.hand.findIndex(
        (card) =>
          card.suit === payload.card?.suit && card.rank === payload.card.rank,
      );
      if (cardIndex < 0) {
        return this.failure('CARD_NOT_IN_HAND', 'الورقة ليست في يدك.');
      }
      const card = found.seat.hand[cardIndex];
      const move = validateCardMove(
        found.room.currentTrick.map((play) => play.card),
        found.seat.hand,
        card,
        found.room.contract.mode,
      );
      if (!move.ok) {
        return this.failure('ILLEGAL_MOVE', 'يجب اتباع اللون أو الحكم المتاح.');
      }

      found.room.processedCommands.add(payload.commandId!);
      this.applyPlay(found.room, found.seat.seat, card);
      await this.persist(found.room);
      return {
        ok: true as const,
        data: this.buildSession(found.room, sessionToken),
      };
    });
  }

  async playTimedOutTurn(
    roomCode: string,
    expectedVersion: number,
    expectedTurn: number,
  ): Promise<boolean> {
    return this.withRoomLock(roomCode, async () => {
      const room = await this.resolveRoom(roomCode);
      if (
        !room ||
        room.phase !== 'PLAYING' ||
        !room.contract ||
        room.stateVersion !== expectedVersion ||
        room.turn !== expectedTurn
      ) {
        return false;
      }
      const seat = room.seats[expectedTurn];
      if (!seat || seat.hand.length === 0) return false;
      const choice = selectTimeoutPlay(
        seat.hand,
        room.currentTrick.map((play) => play.card),
        room.contract.mode,
      );
      const card = seat.hand.find(
        (candidate) =>
          candidate.suit === choice.card.suit &&
          candidate.rank === choice.card.rank,
      );
      if (!card) return false;
      room.autoPlayEvents.push({
        ...choice.event,
        seat: expectedTurn,
        trickNumber: room.trickHistory.length + 1,
        card: { ...card },
      });
      this.applyPlay(room, expectedTurn, card);
      await this.persist(room);
      return true;
    });
  }

  async reconnect(
    input: ReconnectBalootPayload,
  ): Promise<BalootResult<BalootSession>> {
    await this.removeExpiredRooms();
    const sessionToken = input.sessionToken ?? '';
    const roomCode = await this.lookupRoomCode(sessionToken);
    if (!roomCode)
      return this.failure('INVALID_SESSION', 'جلسة البلوت غير صالحة.');
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return found;
      if (found.seat.connected) {
        return {
          ok: true as const,
          data: this.buildSession(found.room, sessionToken),
        };
      }
      found.seat.connected = true;
      found.room.stateVersion += 1;
      const rotatedToken = this.createSessionToken();
      found.seat.sessionToken = rotatedToken;
      this.sessionRooms.delete(sessionToken);
      this.sessionRooms.set(rotatedToken, roomCode);
      await this.deleteSession(sessionToken);
      await this.indexSession(rotatedToken, roomCode);
      await this.persist(found.room);
      return {
        ok: true as const,
        data: this.buildSession(found.room, rotatedToken),
      };
    });
  }

  async resume(sessionToken: string): Promise<BalootResult<BalootSession>> {
    const roomCode = await this.lookupRoomCode(sessionToken);
    if (!roomCode)
      return this.failure('INVALID_SESSION', 'جلسة البلوت غير صالحة.');
    const found = await this.findSession(roomCode, sessionToken);
    if (!found.ok) return found;
    if (!found.seat.connected) {
      found.seat.connected = true;
      found.room.stateVersion += 1;
      await this.persist(found.room);
    }
    return { ok: true, data: this.buildSession(found.room, sessionToken) };
  }

  async disconnect(sessionToken: string) {
    const roomCode = await this.lookupRoomCode(sessionToken);
    if (!roomCode) return null;
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return null;
      found.seat.connected = false;
      found.room.stateVersion += 1;
      await this.persist(found.room);
      return found.seat;
    });
  }

  async leave(sessionToken: string) {
    const roomCode = await this.lookupRoomCode(sessionToken);
    if (!roomCode) return null;
    return this.withRoomLock(roomCode, async () => {
      const found = await this.findSession(roomCode, sessionToken);
      if (!found.ok) return null;
      if (found.room.phase === 'LOBBY' || found.room.phase === 'READY') {
        found.room.seats[found.seat.seat] = null;
        this.sessionRooms.delete(sessionToken);
        await this.deleteSession(sessionToken);
        found.room.stateVersion += 1;
        this.syncLobbyPhase(found.room);
        if (this.occupiedSeats(found.room).length === 0) {
          this.rooms.delete(roomCode);
          await this.deleteRoom(roomCode);
          return found.seat;
        }
        await this.persist(found.room);
        return found.seat;
      }
      found.seat.connected = false;
      found.room.stateVersion += 1;
      await this.persist(found.room);
      return found.seat;
    });
  }

  async getSnapshot(
    roomCode: string,
    sessionToken: string,
  ): Promise<BalootSnapshot | null> {
    const room = await this.resolveRoom(roomCode);
    return room ? this.buildSnapshot(room, sessionToken) : null;
  }

  /**
   * Builds every viewer's snapshot from one room read so a single broadcast
   * cannot mix state versions across recipients.
   */
  async getSnapshots(roomCode: string, sessionTokens: Iterable<string>) {
    const snapshots = new Map<string, BalootSnapshot>();
    const room = await this.resolveRoom(roomCode);
    if (!room) return snapshots;
    for (const sessionToken of new Set(sessionTokens)) {
      const snapshot = this.buildSnapshot(room, sessionToken);
      if (snapshot) snapshots.set(sessionToken, snapshot);
    }
    return snapshots;
  }

  private buildSnapshot(
    room: BalootRoom,
    sessionToken: string,
  ): BalootSnapshot | null {
    const viewer = room.seats.find(
      (seat) => seat?.sessionToken === sessionToken,
    );
    if (!viewer) return null;
    return {
      roomCode: room.roomCode,
      phase: room.phase,
      stateVersion: room.stateVersion,
      seats: room.seats
        .filter((seat): seat is NonNullable<typeof seat> => Boolean(seat))
        .map((seat) => ({
          seat: seat.seat,
          team: seat.team,
          playerName: seat.playerName,
          ready: seat.ready,
          connected: seat.connected,
          isHost: seat.isHost,
        })),
      yourSeat: viewer.seat,
      yourTeam: viewer.team,
      yourHand: viewer.hand.map((card) => ({ ...card })),
      contract: room.contract ? { ...room.contract } : null,
      lastContract: room.lastContract ? { ...room.lastContract } : null,
      buyerPlayerId: room.buyerPlayerId,
      leaderSeat: room.leaderSeat,
      auctionRound: room.auctionRound,
      bidder: room.bidder,
      pendingDouble: room.pendingDouble ? { ...room.pendingDouble } : null,
      turn: room.turn,
      currentTrick: room.currentTrick.map((play) => ({
        seat: play.seat,
        card: { ...play.card },
      })),
      trickHistory: room.trickHistory.map((trick) => ({
        winnerSeat: trick.winnerSeat,
        winnerTeam: trick.winnerTeam,
        cards: trick.cards.map((play) => ({
          seat: play.seat,
          card: { ...play.card },
        })),
      })),
      scores: [...room.scores],
      roundScore: room.roundScore,
      autoPlayEvents: room.autoPlayEvents.map((event) => ({
        ...event,
        card: { ...event.card },
      })),
      availableBids: computeAvailableBids(room, viewer.seat),
    };
  }

  async trackSocket(roomCode: string, socketId: string, sessionToken: string) {
    if (!this.redisEnabled()) return;
    await this.redis!.addBalootSocket(roomCode, socketId, sessionToken);
  }

  async untrackSocket(roomCode: string, socketId: string) {
    if (!this.redisEnabled()) return;
    await this.redis!.removeBalootSocket(roomCode, socketId);
  }

  async listRoomSockets(roomCode: string) {
    if (!this.redisEnabled()) return [];
    return this.redis!.listBalootSockets(roomCode);
  }

  private resolveTrick(room: BalootRoom) {
    const winnerOffset = getTrickWinner(
      room.currentTrick.map((play) => play.card),
      room.contract!.mode,
    );
    const winnerSeat = room.currentTrick[winnerOffset].seat;
    const winnerTeam = winnerSeat % 2 === 0 ? 'A' : 'B';
    room.phase = 'TRICK_RESULT';
    room.trickHistory.push({
      winnerSeat,
      winnerTeam,
      cards: room.currentTrick.map((play) => ({
        seat: play.seat,
        card: { ...play.card },
      })),
    });
    room.currentTrick = [];
    room.turn = winnerSeat;
    room.stateVersion += 1;
    if (this.occupiedSeats(room).every((seat) => seat.hand.length === 0)) {
      const buyerTeam = room.buyerPlayerId % 2 === 0 ? 0 : 1;
      const countingTeam =
        room.contract!.multiplier === 1 || room.contract!.multiplier === 3
          ? buyerTeam === 0
            ? 1
            : 0
          : buyerTeam;
      const roundScore = scoreRound({
        contract: room.contract!.mode,
        tricks: room.trickHistory.map((trick) => ({
          winnerTeam: trick.winnerTeam === 'A' ? 0 : 1,
          cards: trick.cards.map((play) => play.card),
        })),
        buyerPlayerId: room.buyerPlayerId,
        countingTeam,
        projects: room.projectDeclarations,
        balootTeams: room.balootTeams,
        multiplier: room.contract!.multiplier,
      });
      room.roundScore = roundScore;
      // The RoundScore exposes `applied` (the post-multiplier totals) so
      // the UI can show "×2" / "×4" without re-deriving the arithmetic.
      const match = applyRoundToMatch(room.scores, roundScore);
      room.scores = [...match.scores];
      room.phase = match.winnerTeam === null ? 'ROUND_RESULT' : 'GAME_OVER';
      room.turn = null;
    } else {
      room.phase = 'PLAYING';
    }
  }

  private applyPlay(room: BalootRoom, seatIndex: number, card: BalootCard) {
    const seat = room.seats[seatIndex];
    if (!seat) throw new Error('Baloot turn points to an empty seat.');
    seat.hand = seat.hand.filter((candidate) => candidate.id !== card.id);
    room.currentTrick.push({ seat: seatIndex, card: { ...card } });
    room.turn = (seatIndex + 1) % MAX_PLAYERS;
    room.stateVersion += 1;
    if (room.currentTrick.length === MAX_PLAYERS) this.resolveTrick(room);
  }

  private validateCommand(
    room: BalootRoom,
    payload: { commandId?: string; expectedVersion?: number },
  ): BalootFailure | null {
    const commandId = payload.commandId?.trim();
    if (!commandId || commandId.length > 100) {
      return this.failure('INVALID_COMMAND', 'معرّف الأمر غير صالح.');
    }
    if (room.processedCommands.has(commandId)) {
      return this.failure('DUPLICATE_COMMAND', 'تم تنفيذ هذا الأمر مسبقاً.');
    }
    if (payload.expectedVersion !== room.stateVersion) {
      return this.failure(
        'STALE_VERSION',
        `نسخة الحالة الحالية ${room.stateVersion}.`,
      );
    }
    return null;
  }

  private isBid(
    value: BidBalootPayload['bid'],
  ): value is NonNullable<BidBalootPayload['bid']> {
    if (!value) return false;
    if (
      value.mode === 'pass' ||
      value.mode === 'sun' ||
      value.mode === 'ashkal' ||
      value.mode === 'accept' ||
      value.mode === 'triple' ||
      value.mode === 'gahwa'
    ) {
      return true;
    }
    if (value.mode === 'hokum') {
      return BALOOT_RULES.suits.includes(value.trump);
    }
    if (value.mode === 'double' || value.mode === 'quadruple') {
      return value.play === 'open' || value.play === 'locked';
    }
    return false;
  }

  private buildSession(room: BalootRoom, sessionToken: string): BalootSession {
    const viewer = room.seats.find(
      (seat) => seat?.sessionToken === sessionToken,
    );
    if (!viewer) throw new Error('Baloot session is inconsistent.');
    return {
      roomCode: room.roomCode,
      sessionToken,
      snapshot: {
        roomCode: room.roomCode,
        phase: room.phase,
        stateVersion: room.stateVersion,
        seats: this.occupiedSeats(room).map((seat) => ({
          seat: seat.seat,
          team: seat.team,
          playerName: seat.playerName,
          ready: seat.ready,
          connected: seat.connected,
          isHost: seat.isHost,
        })),
        yourSeat: viewer.seat,
        yourTeam: viewer.team,
        yourHand: viewer.hand.map((card) => ({ ...card })),
        contract: room.contract ? { ...room.contract } : null,
        lastContract: room.lastContract ? { ...room.lastContract } : null,
        buyerPlayerId: room.buyerPlayerId,
        leaderSeat: room.leaderSeat,
        auctionRound: room.auctionRound,
        bidder: room.bidder,
        pendingDouble: room.pendingDouble ? { ...room.pendingDouble } : null,
        turn: room.turn,
        currentTrick: room.currentTrick.map((play) => ({
          seat: play.seat,
          card: { ...play.card },
        })),
        trickHistory: room.trickHistory.map((trick) => ({
          winnerSeat: trick.winnerSeat,
          winnerTeam: trick.winnerTeam,
          cards: trick.cards.map((play) => ({
            seat: play.seat,
            card: { ...play.card },
          })),
        })),
        scores: [...room.scores],
        roundScore: room.roundScore,
        autoPlayEvents: room.autoPlayEvents.map((event) => ({
          ...event,
          card: { ...event.card },
        })),
        availableBids: computeAvailableBids(room, viewer.seat),
      },
    };
  }

  private dealRound(room: BalootRoom, bidder: number) {
    room.phase = 'DEALING';
    room.contract = null;
    room.lastContract = null;
    room.bidder = bidder;
    room.buyerPlayerId = bidder;
    room.passCount = 0;
    room.bidLog = [];
    room.auctionRound = 1;
    room.turn = null;
    room.currentTrick = [];
    room.trickHistory = [];
    room.roundScore = null;
    room.projectDeclarations = [];
    room.balootTeams = [];
    room.autoPlayEvents = [];
    room.processedCommands = new Set();
    room.pendingDouble = null;
    room.leaderSeat = bidder;
    room.stateVersion += 1;
    const deck = shuffleDeck(createDeck(), this.random).map((card) => ({
      ...card,
      id: `${card.suit}-${card.rank}`,
    }));
    room.seats.forEach((seat, index) => {
      if (seat) seat.hand = deck.slice(index * 8, index * 8 + 8);
    });
    room.phase = 'BIDDING';
    room.stateVersion += 1;
  }

  private touch(room: BalootRoom) {
    room.expiresAt = Date.now() + ROOM_TTL_MS;
  }

  private async removeExpiredRooms() {
    const now = Date.now();
    for (const [roomCode, room] of this.rooms) {
      if (room.expiresAt > now) continue;
      this.rooms.delete(roomCode);
      for (const seat of room.seats) {
        if (seat) {
          this.sessionRooms.delete(seat.sessionToken);
          await this.deleteSession(seat.sessionToken);
        }
      }
      await this.deleteRoom(roomCode);
    }
  }

  private async findSession(roomCode: string, sessionToken: string) {
    const room = await this.resolveRoom(roomCode);
    const seat = room?.seats.find(
      (candidate) => candidate?.sessionToken === sessionToken,
    );
    if (!room || !seat)
      return this.failure('INVALID_SESSION', 'جلسة البلوت غير صالحة.');
    return { ok: true as const, room, seat };
  }

  private occupiedSeats(room: BalootRoom) {
    return room.seats.filter(
      (seat): seat is NonNullable<(typeof room.seats)[number]> => Boolean(seat),
    );
  }

  private findOpenSeatIndex(room: BalootRoom) {
    const empty = room.seats.findIndex((seat) => seat === null);
    if (empty >= 0) return empty;
    if (room.phase === 'LOBBY' || room.phase === 'READY') {
      return room.seats.findIndex((seat) => Boolean(seat) && !seat?.connected);
    }
    return -1;
  }

  private syncLobbyPhase(room: BalootRoom) {
    if (room.phase !== 'LOBBY' && room.phase !== 'READY') return;
    const occupied = this.occupiedSeats(room);
    room.phase =
      occupied.length === MAX_PLAYERS && occupied.every((seat) => seat.ready)
        ? 'READY'
        : 'LOBBY';
  }

  private async createRoomCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const roomCode = randomInt(100000, 1000000).toString();
      if (this.rooms.has(roomCode)) continue;
      if (this.redisEnabled()) {
        try {
          const existing = await this.redis!.loadBalootRoom(roomCode);
          if (existing) continue;
        } catch {
          /* fall through and use the candidate */
        }
      }
      return roomCode;
    }
    throw new Error('Unable to allocate a Baloot room code.');
  }

  private createSessionToken() {
    return randomBytes(32).toString('hex');
  }

  private normalizeRoomCode(value: string | undefined) {
    return (
      value
        ?.trim()
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
        .replace(/\D/g, '')
        .slice(0, 6) ?? ''
    );
  }

  private normalizeName(value: string | undefined) {
    const name = value?.trim().replace(/\s+/g, ' ') ?? '';
    return name.length >= 2 && name.length <= 30 ? name : '';
  }

  private invalidName(): BalootFailure {
    return this.failure('INVALID_NAME', 'اكتب اسماً من حرفين إلى 30 حرفاً.');
  }

  private failure(code: string, message: string): BalootFailure {
    return { ok: false, code, message };
  }

  private redisEnabled() {
    if (!this.redis) return false;
    return typeof this.redis.hasSharedStore === 'function'
      ? this.redis.hasSharedStore()
      : this.redis.isConfigured();
  }

  private serialize(room: BalootRoom): SerializedBalootRoom {
    return {
      ...room,
      processedCommands: [...room.processedCommands],
    };
  }

  private deserialize(raw: SerializedBalootRoom): BalootRoom {
    const seats = [...raw.seats];
    while (seats.length < MAX_PLAYERS) seats.push(null);
    return {
      ...raw,
      seats: seats.slice(0, MAX_PLAYERS),
      projectDeclarations: raw.projectDeclarations ?? [],
      balootTeams: raw.balootTeams ?? [],
      autoPlayEvents: raw.autoPlayEvents ?? [],
      processedCommands: new Set(raw.processedCommands ?? []),
    };
  }

  private async resolveRoom(roomCode: string) {
    const local = this.rooms.get(roomCode);
    if (this.redisEnabled()) {
      try {
        const remote =
          await this.redis!.loadBalootRoom<SerializedBalootRoom>(roomCode);
        if (remote) {
          const room = this.deserialize(remote);
          this.rooms.set(roomCode, room);
          for (const seat of room.seats) {
            if (seat) this.sessionRooms.set(seat.sessionToken, roomCode);
          }
          return room;
        }
      } catch (error) {
        console.error(
          '[Baloot] failed to load room from Redis:',
          error instanceof Error ? error.message : error,
        );
      }
    }
    return local;
  }

  private async lookupRoomCode(sessionToken: string) {
    const local = this.sessionRooms.get(sessionToken);
    if (local) return local;
    if (!this.redisEnabled()) return undefined;
    try {
      return (await this.redis!.getBalootSession(sessionToken)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async persist(room: BalootRoom) {
    this.touch(room);
    this.rooms.set(room.roomCode, room);
    if (!this.redisEnabled()) return;
    try {
      await this.redis!.saveBalootRoom(room.roomCode, this.serialize(room));
    } catch (error) {
      console.error(
        '[Baloot] failed to persist room:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async indexSession(sessionToken: string, roomCode: string) {
    if (!this.redisEnabled()) return;
    try {
      await this.redis!.setBalootSession(sessionToken, roomCode);
    } catch (error) {
      console.error(
        '[Baloot] failed to index session:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async deleteSession(sessionToken: string) {
    if (!this.redisEnabled()) return;
    try {
      await this.redis!.deleteBalootSession(sessionToken);
    } catch {
      return;
    }
  }

  private async deleteRoom(roomCode: string) {
    if (!this.redisEnabled()) return;
    try {
      await this.redis!.deleteBalootRoom(roomCode);
    } catch {
      return;
    }
  }

  private async withRoomLock<T>(
    roomCode: string,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!this.redisEnabled()) return action();
    const token = randomUUID();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const acquired = await this.redis!.acquireBalootRoomLock(roomCode, token);
      if (acquired) {
        try {
          return await action();
        } finally {
          await this.redis!.releaseBalootRoomLock(roomCode, token);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return action();
  }
}
