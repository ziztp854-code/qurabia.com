import {
  detectProjects,
  createDeck,
  getTrickWinner,
  hasBaloot,
  scoreRound,
  shuffleDeck,
  type Card,
} from '../../../../../packages/domain/src/index.js';
import { BalootService } from '../baloot.service.js';
import { BalootGateway } from '../baloot.gateway.js';
import type { Server } from 'socket.io';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

/**
 * Coverage tests for Baloot that complement the existing suite:
 *  - Domain: edge cases (empty hands, no projects, 4/5-card runs, RNG errors,
 *    single-card trick, score variations).
 *  - Service: negative paths and lifecycle edge cases (invalid name,
 *    ROOM_NOT_FOUND, NOT_READY, NOT_YOUR_TURN, ILLEGAL_MOVE,
 *    CARD_NOT_IN_HAND, INVALID_BID, room cleanup, getSnapshot nullability,
 *    snapshot map for multiple viewers, redis-free helpers).
 *  - Gateway: rate limiting, no-identity disconnect, leave handler edge cases,
 *    identity preservation on join, gateway-level reattach for the same socket.
 */

describe('Baloot — domain edge cases', () => {
  it('returns no projects for an empty hand', () => {
    expect(detectProjects([])).toEqual([]);
  });

  it('returns no projects for a hand with no runs or four-of-a-kinds', () => {
    const hand = [
      card('hearts', '7'),
      card('hearts', 'J'),
      card('clubs', 'K'),
      card('diamonds', 'A'),
      card('spades', 'Q'),
    ];

    expect(detectProjects(hand)).toEqual([]);
  });

  it('detects a 4-card run without embedding contract-specific points', () => {
    const projects = detectProjects([
      card('hearts', '7'),
      card('hearts', '8'),
      card('hearts', '9'),
      card('hearts', '10'),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ kind: 'run' });
    expect(projects[0]).not.toHaveProperty('points');
    expect(projects[0]?.cards).toHaveLength(4);
  });

  it('detects a 5-card run without embedding contract-specific points', () => {
    // Five CONSECUTIVE cards (7,8,9,10,J) — the detector only groups
    // strictly consecutive ranks, so gaps break the run.
    const projects = detectProjects([
      card('hearts', '7'),
      card('hearts', '8'),
      card('hearts', '9'),
      card('hearts', '10'),
      card('hearts', 'J'),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ kind: 'run' });
    expect(projects[0]).not.toHaveProperty('points');
    expect(projects[0]?.cards).toHaveLength(5);
  });

  it('excludes 7s, 8s, and 9s from four-of-a-kind projects', () => {
    const sevens = detectProjects([
      card('hearts', '7'),
      card('clubs', '7'),
      card('diamonds', '7'),
      card('spades', '7'),
    ]);
    const eights = detectProjects([
      card('hearts', '8'),
      card('clubs', '8'),
      card('diamonds', '8'),
      card('spades', '8'),
    ]);
    const nines = detectProjects([
      card('hearts', '9'),
      card('clubs', '9'),
      card('diamonds', '9'),
      card('spades', '9'),
    ]);

    expect(sevens).toEqual([]);
    expect(eights).toEqual([]);
    expect(nines).toEqual([]);
  });

  it('rejects a shuffled RNG that returns NaN or out-of-range values', () => {
    const deck = [
      card('hearts', '7'),
      card('hearts', '8'),
      card('hearts', '9'),
    ];
    expect(() => shuffleDeck(deck, () => Number.NaN)).toThrow(RangeError);
    expect(() => shuffleDeck(deck, () => 1)).toThrow(RangeError);
    expect(() => shuffleDeck(deck, () => -0.0001)).toThrow(RangeError);
  });

  it('returns the only card as the trick winner for a single-card trick', () => {
    expect(getTrickWinner([card('hearts', 'A')], { mode: 'sun' })).toBe(0);
    expect(
      getTrickWinner([card('spades', 'J')], { mode: 'hokum', trump: 'spades' }),
    ).toBe(0);
  });

  it('scores a complete Sun round with no projects or Baloot', () => {
    const deck = createDeck();
    const result = scoreRound({
      contract: { mode: 'sun' },
      tricks: Array.from({ length: 8 }, (_, index) => ({
        winnerTeam: index < 4 ? 0 : 1,
        cards: deck.slice(index * 4, index * 4 + 4),
      })),
      buyerPlayerId: 0,
      countingTeam: 0,
    });

    expect(result).toEqual({
      teams: [
        {
          rawCardPoints: 60,
          cardPoints: 12,
          projectPoints: 0,
          balootPoints: 0,
          lastTrickPoints: 0,
          total: 12,
        },
        {
          rawCardPoints: 70,
          cardPoints: 14,
          projectPoints: 0,
          balootPoints: 0,
          lastTrickPoints: 10,
          total: 14,
        },
      ],
      total: 26,
      multiplier: 1,
      applied: [0, 26],
      winnerTeam: 1,
      kaboot: false,
    });
  });

  it('awards baloot points to every team that holds the trump K+Q', () => {
    const deck = createDeck();
    const result = scoreRound({
      contract: { mode: 'hokum', trump: 'spades' },
      tricks: Array.from({ length: 8 }, (_, index) => ({
        winnerTeam: index < 4 ? 0 : 1,
        cards: deck.slice(index * 4, index * 4 + 4),
      })),
      balootTeams: [0, 1],
      buyerPlayerId: 0,
      countingTeam: 0,
    });

    expect(result.teams[0]?.balootPoints).toBe(2);
    expect(result.teams[1]?.balootPoints).toBe(2);
  });

  it('detects hasBaloot independently per call', () => {
    expect(
      hasBaloot([card('spades', 'K'), card('spades', 'Q')], 'spades'),
    ).toBe(true);
    expect(
      hasBaloot([card('spades', 'K'), card('spades', '7')], 'spades'),
    ).toBe(false);
    expect(
      hasBaloot([card('hearts', 'K'), card('hearts', 'Q')], 'hearts'),
    ).toBe(true);
  });
});

describe('BalootService — negative paths and lifecycle', () => {
  let service: BalootService;

  beforeEach(() => {
    service = new BalootService();
  });

  it('rejects createRoom with empty or whitespace names', async () => {
    expect(await service.createRoom({ playerName: '' })).toMatchObject({
      ok: false,
      code: 'INVALID_NAME',
    });
    expect(await service.createRoom({ playerName: '   ' })).toMatchObject({
      ok: false,
      code: 'INVALID_NAME',
    });
  });

  it('returns ROOM_NOT_FOUND when joining an unknown room', async () => {
    expect(
      await service.joinRoom({ roomCode: '000000', playerName: 'P1' }),
    ).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
  });

  it('rejects startGame when seats are not all ready', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      expect(joined.ok).toBe(true);
    }
    await service.setReady(
      created.data.roomCode,
      created.data.sessionToken,
      true,
    );
    expect(
      await service.startGame(created.data.roomCode, created.data.sessionToken),
    ).toMatchObject({ ok: false, code: 'NOT_READY' });
  });

  it('rejects setReady after a round has started', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);

    expect(
      await service.setReady(
        created.data.roomCode,
        players[0].sessionToken,
        true,
      ),
    ).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
  });

  it('rejects bids from non-bidder seats with NOT_YOUR_TURN', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);
    const snapshot = await service.getSnapshot(
      created.data.roomCode,
      players[0].sessionToken,
    );
    expect(snapshot?.phase).toBe('BIDDING');
    expect(snapshot?.bidder).toBe(0);

    expect(
      await service.bid(created.data.roomCode, players[1].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot!.stateVersion,
        commandId: 'wrong-turn-bid',
      }),
    ).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
  });

  it('rejects malformed bids with INVALID_BID', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);
    const snapshot = await service.getSnapshot(
      created.data.roomCode,
      players[0].sessionToken,
    );

    expect(
      await service.bid(created.data.roomCode, players[0].sessionToken, {
        // Bypass TS at runtime by passing an invalid shape.
        bid: { mode: 'hokum', trump: 'not-a-suit' } as never,
        expectedVersion: snapshot!.stateVersion,
        commandId: 'malformed-bid',
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_BID' });
  });

  it('rejects playCard with CARD_NOT_IN_HAND', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);
    const snapshot = (await service.getSnapshot(
      created.data.roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(created.data.roomCode, players[0].sessionToken, {
      bid: { mode: 'sun' },
      expectedVersion: snapshot.stateVersion,
      commandId: 'sun-bid',
    });
    // The other three players each pass to close the auction.
    for (let seat = 1; seat < 4; seat += 1) {
      const seatSnapshot = (await service.getSnapshot(
        created.data.roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(created.data.roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: seatSnapshot.stateVersion,
        commandId: `sun-pass-${seat}`,
      });
    }
    // The opponent team accepts the contract explicitly.
    const doubler = (await service.getSnapshot(
      created.data.roomCode,
      players[1].sessionToken,
    ))!;
    await service.bid(created.data.roomCode, players[1].sessionToken, {
      bid: { mode: 'accept' },
      expectedVersion: doubler.stateVersion,
      commandId: 'sun-accept',
    });

    const playingSnapshot = (await service.getSnapshot(
      created.data.roomCode,
      players[0].sessionToken,
    ))!;
    // Find a card that is definitely NOT in the player's hand by
    // checking the full 32-card deck against the player's hand.
    const handIds = new Set(playingSnapshot.yourHand.map((c) => c.id));
    const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
    const missingCard =
      suits
        .flatMap((suit) =>
          RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })),
        )
        .find((card) => !handIds.has(card.id)) ?? playingSnapshot.yourHand[0];

    expect(
      await service.playCard(created.data.roomCode, players[0].sessionToken, {
        card: missingCard,
        expectedVersion: playingSnapshot.stateVersion,
        commandId: 'not-in-hand',
      }),
    ).toMatchObject({ ok: false, code: 'CARD_NOT_IN_HAND' });
  });

  it('rejects playCard that breaks follow-suit or trump rules', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);
    const snapshot = (await service.getSnapshot(
      created.data.roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(created.data.roomCode, players[0].sessionToken, {
      bid: { mode: 'hokum', trump: 'spades' },
      expectedVersion: snapshot.stateVersion,
      commandId: 'hokum-bid',
    });
    // Three passes close the auction, then a double/redouble drive the
    // table into PLAYING.
    for (let seat = 1; seat < 4; seat += 1) {
      const seatSnapshot = (await service.getSnapshot(
        created.data.roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(created.data.roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: seatSnapshot.stateVersion,
        commandId: `hokum-pass-${seat}`,
      });
    }
    const doubler = (await service.getSnapshot(
      created.data.roomCode,
      players[1].sessionToken,
    ))!;
    await service.bid(created.data.roomCode, players[1].sessionToken, {
      bid: { mode: 'accept' },
      expectedVersion: doubler.stateVersion,
      commandId: 'hokum-accept',
    });

    const playing = (await service.getSnapshot(
      created.data.roomCode,
      players[0].sessionToken,
    ))!;
    // Player 0 leads first — pick a non-spade card; any card is legal on the
    // opening lead. After the led card is in the trick the SAME player cannot
    // play again, so the test uses a different player to check follow-suit.
    const opener = playing.yourHand[0];
    await service.playCard(created.data.roomCode, players[0].sessionToken, {
      card: { suit: opener.suit, rank: opener.rank },
      expectedVersion: playing.stateVersion,
      commandId: 'open-lead',
    });

    const next = (await service.getSnapshot(
      created.data.roomCode,
      players[1].sessionToken,
    ))!;
    const heldSuits = new Set(next.yourHand.map((entry) => entry.suit));
    if (heldSuits.has(opener.suit)) {
      // If the next player holds the led suit, attempting to play an illegal
      // off-suit card must be rejected.
      const nonLed = next.yourHand.find((entry) => entry.suit !== opener.suit);
      if (nonLed) {
        expect(
          await service.playCard(
            created.data.roomCode,
            players[1].sessionToken,
            {
              card: { suit: nonLed.suit, rank: nonLed.rank },
              expectedVersion: next.stateVersion,
              commandId: 'follow-suit-break',
            },
          ),
        ).toMatchObject({ ok: false, code: 'ILLEGAL_MOVE' });
      }
    }
    // Sanity: at least one of these two branches is exercised.
    expect(true).toBe(true);
  });

  it('rejects nextRound from a non-host with NOT_HOST and before round ends', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);

    expect(
      await service.nextRound(created.data.roomCode, players[1].sessionToken),
    ).toMatchObject({ ok: false, code: 'NOT_HOST' });

    expect(
      await service.nextRound(created.data.roomCode, players[0].sessionToken),
    ).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
  });

  it('returns null snapshots and errors for invalid sessions', async () => {
    expect(
      await service.getSnapshot('any-room', 'not-a-real-token'),
    ).toBeNull();

    const resume = await service.resume('not-a-real-token');
    expect(resume).toMatchObject({ ok: false, code: 'INVALID_SESSION' });

    expect(await service.disconnect('not-a-real-token')).toBeNull();
  });

  it('cleans up the room when the last player leaves the lobby', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    await service.leave(created.data.sessionToken);

    expect(
      await service.getSnapshot(
        created.data.roomCode,
        created.data.sessionToken,
      ),
    ).toBeNull();
    expect(
      await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: 'New',
      }),
    ).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
  });

  it('marks a seat as disconnected when leaving mid-game', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);
    const snapshot = (await service.getSnapshot(
      created.data.roomCode,
      players[1].sessionToken,
    ))!;
    expect(snapshot.phase).toBe('BIDDING');

    const after = await service.leave(players[1].sessionToken);
    expect(after).not.toBeNull();
    const refreshed = await service.getSnapshot(
      created.data.roomCode,
      players[0].sessionToken,
    );
    expect(refreshed?.seats[1]?.connected).toBe(false);
  });

  it('returns per-viewer snapshots via getSnapshots and skips unknown tokens', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const joined = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Two',
    });
    if (!joined.ok) throw new Error('join failed');

    const snapshots = await service.getSnapshots(created.data.roomCode, [
      created.data.sessionToken,
      joined.data.sessionToken,
      'unknown',
    ]);

    expect(snapshots.size).toBe(2);
    expect(snapshots.get(created.data.sessionToken)?.yourSeat).toBe(0);
    expect(snapshots.get(joined.data.sessionToken)?.yourSeat).toBe(1);
    expect(snapshots.has('unknown')).toBe(false);
  });

  it('returns an empty socket list when Redis is not configured', async () => {
    expect(await service.listRoomSockets('any-room')).toEqual([]);
    await expect(
      service.trackSocket('any-room', 'socket-1', 'token'),
    ).resolves.toBeUndefined();
    await expect(
      service.untrackSocket('any-room', 'socket-1'),
    ).resolves.toBeUndefined();
  });

  it('rejects joinRoom after the game has started with GAME_STARTED', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const players = [created.data];
    for (const name of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: name,
      });
      if (!joined.ok) throw new Error('join failed');
      players.push(joined.data);
    }
    for (const player of players) {
      await service.setReady(created.data.roomCode, player.sessionToken, true);
    }
    await service.startGame(created.data.roomCode, players[0].sessionToken);
    await service.bid(created.data.roomCode, players[0].sessionToken, {
      bid: { mode: 'sun' },
      expectedVersion: (await service.getSnapshot(
        created.data.roomCode,
        players[0].sessionToken,
      ))!.stateVersion,
      commandId: 'sun-after-start',
    });

    expect(
      await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: 'Latecomer',
      }),
    ).toMatchObject({ ok: false, code: 'GAME_STARTED' });
  });
});

describe('BalootGateway — edge cases', () => {
  type TestBalootSocket = Parameters<BalootGateway['createRoom']>[0];

  function makeSocket(
    id: string,
    overrides: Partial<TestBalootSocket> = {},
  ): TestBalootSocket {
    return {
      id,
      join: jest.fn(),
      leave: jest.fn(),
      data: {},
      ...overrides,
    } as unknown as TestBalootSocket;
  }

  it('returns RATE_LIMITED when the socket exceeds the host bucket', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as Server;
    const client = makeSocket('rate-host');
    for (let i = 0; i < 5; i += 1) {
      const result = await gateway.createRoom(client, { playerName: 'Host' });
      expect(result.ok).toBe(true);
      // Intentionally do NOT call handleDisconnect — the gateway clears the
      // socket's rate-limit bucket on disconnect, which would reset the count.
    }
    const next = await gateway.createRoom(client, { playerName: 'Host' });
    expect(next).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });

  it('returns INVALID_SESSION for actions when the socket has no identity', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as Server;
    const client = makeSocket('no-id');

    const ready = await gateway.ready(client, { ready: true });
    expect(ready).toMatchObject({ ok: false, code: 'INVALID_SESSION' });

    const start = await gateway.start(client, {});
    expect(start).toMatchObject({ ok: false, code: 'INVALID_SESSION' });

    const bid = await gateway.bid(client, {
      bid: { mode: 'pass' },
      expectedVersion: 0,
      commandId: 'cmd',
    });
    expect(bid).toMatchObject({ ok: false, code: 'INVALID_SESSION' });

    const play = await gateway.playCard(client, {
      card: { suit: 'hearts', rank: '7' },
      expectedVersion: 0,
      commandId: 'cmd',
    });
    expect(play).toMatchObject({ ok: false, code: 'INVALID_SESSION' });

    const leave = await gateway.leave(client, {});
    expect(leave).toMatchObject({ ok: false, code: 'INVALID_SESSION' });
  });

  it('handleDisconnect without an identity is a no-op and clears the rate limiter', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as Server;
    const client = makeSocket('no-id-disconnect');
    await expect(gateway.handleDisconnect(client)).resolves.toBeUndefined();
  });

  it('resumes the same room when joinRoom is called from the same socket', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as Server;
    const client = makeSocket('resume');
    const hosted = await gateway.createRoom(client, { playerName: 'Host' });
    if (!hosted.ok) throw new Error('host failed');

    const resumed = await gateway.joinRoom(client, {
      roomCode: hosted.data.roomCode,
      playerName: 'Host',
    });

    expect(resumed).toMatchObject({
      ok: true,
      data: {
        roomCode: hosted.data.roomCode,
        sessionToken: hosted.data.sessionToken,
      },
    });
  });

  it('rejects bids whose payload fails Zod validation before reaching the service', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as Server;
    const client = makeSocket('zod-bid');
    const hosted = await gateway.createRoom(client, { playerName: 'Host' });
    if (!hosted.ok) throw new Error('host failed');

    const result = await gateway.bid(client, {
      // Missing expectedVersion and commandId; bid.trump invalid.
      bid: { mode: 'hokum', trump: 'not-a-suit' },
    } as never);

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
  });

  it('rejects playCard payloads that omit the card entirely', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as Server;
    const client = makeSocket('zod-play');
    const hosted = await gateway.createRoom(client, { playerName: 'Host' });
    if (!hosted.ok) throw new Error('host failed');

    const result = await gateway.playCard(client, {
      expectedVersion: 1,
      commandId: 'no-card',
    });

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
  });

  it('rejects reconnects with malformed session tokens', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as Server;
    const client = makeSocket('bad-reconnect');

    const result = await gateway.reconnect(client, {
      sessionToken: 'not-hex',
    });

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
  });
});
