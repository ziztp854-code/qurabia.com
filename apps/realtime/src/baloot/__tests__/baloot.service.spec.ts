import { BalootService } from '../baloot.service.js';
import { getLegalPlays, selectTimeoutPlay } from '@tahaddi/domain';
import type { RedisService } from '../../game/redis.service.js';

describe('BalootService', () => {
  let service: BalootService;

  beforeEach(() => {
    service = new BalootService();
  });

  it('requires the host token to recover a disconnected host seat', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    await service.disconnect(created.data.sessionToken);

    expect(
      await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName: 'Host',
      }),
    ).toMatchObject({ ok: false, code: 'NAME_TAKEN' });
    const guest = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Guest',
    });
    if (!guest.ok) throw new Error('guest join failed');
    expect(guest.data.snapshot.yourSeat).not.toBe(0);
    expect(
      await service.startGame(created.data.roomCode, guest.data.sessionToken),
    ).toMatchObject({ ok: false, code: 'NOT_HOST' });
    const recovered = await service.reconnect({
      sessionToken: created.data.sessionToken,
    });
    expect(recovered.ok).toBe(true);
    if (recovered.ok) expect(recovered.data.snapshot.yourSeat).toBe(0);
  });

  it('replaces a disconnected guest by name with a new credential', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const guest = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Guest',
    });
    if (!guest.ok) throw new Error('guest join failed');
    await service.disconnect(guest.data.sessionToken);
    const replacement = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Guest',
    });
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) throw new Error('replacement failed');
    expect(replacement.data.sessionToken).not.toBe(guest.data.sessionToken);
    expect(replacement.data.snapshot.yourSeat).toBe(
      guest.data.snapshot.yourSeat,
    );
    expect(await service.resume(guest.data.sessionToken)).toMatchObject({
      ok: false,
      code: 'INVALID_SESSION',
    });
    expect(
      await service.startGame(
        created.data.roomCode,
        replacement.data.sessionToken,
      ),
    ).toMatchObject({ ok: false, code: 'NOT_HOST' });
  });

  it('reserves a disconnected host when all four seats are occupied', async () => {
    const { roomCode, players } = await fillRoom();
    await service.disconnect(players[0].sessionToken);
    expect(
      await service.joinRoom({ roomCode, playerName: 'Replacement' }),
    ).toMatchObject({ ok: false, code: 'ROOM_FULL' });
    expect((await service.resume(players[0].sessionToken)).ok).toBe(true);
  });

  it.each(['leave', 'disconnect', 'resume', 'timeout'] as const)(
    'reports contention for %s without running its mutation',
    async (operation) => {
      const created = await service.createRoom({ playerName: 'Host' });
      if (!created.ok) throw new Error('room creation failed');
      const redis = {
        hasSharedStore: () => true,
        acquireBalootRoomLock: jest.fn().mockResolvedValue(false),
        saveBalootRoom: jest.fn(),
        releaseBalootRoomLock: jest.fn(),
      };
      Object.assign(service, { redis });
      jest.useFakeTimers();
      try {
        const pending =
          operation === 'timeout'
            ? service.playTimedOutTurn(created.data.roomCode, 1, 0)
            : service[operation](created.data.sessionToken);
        await jest.advanceTimersByTimeAsync(2_100);
        expect(await pending).toMatchObject({ ok: false, code: 'ROOM_BUSY' });
        expect(redis.saveBalootRoom).not.toHaveBeenCalled();
        expect(redis.releaseBalootRoomLock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('returns busy without mutating when every shared lock attempt fails, then permits a manual retry', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const redis = {
      hasSharedStore: () => true,
      acquireBalootRoomLock: jest.fn().mockResolvedValue(false),
      releaseBalootRoomLock: jest.fn(),
      loadBalootRoom: jest.fn().mockResolvedValue(null),
      saveBalootRoom: jest.fn(),
    };
    Object.assign(service, { redis: redis as unknown as RedisService });
    jest.useFakeTimers();
    try {
      const pending = service.setReady(
        created.data.roomCode,
        created.data.sessionToken,
        true,
      );
      await jest.advanceTimersByTimeAsync(2_100);
      expect(await pending).toMatchObject({ ok: false, code: 'ROOM_BUSY' });
      expect(redis.acquireBalootRoomLock).toHaveBeenCalledTimes(80);
      expect(redis.saveBalootRoom).not.toHaveBeenCalled();
      expect(redis.releaseBalootRoomLock).not.toHaveBeenCalled();
      const unchanged = await service.getSnapshot(
        created.data.roomCode,
        created.data.sessionToken,
      );
      expect(unchanged?.stateVersion).toBe(created.data.snapshot.stateVersion);
      redis.acquireBalootRoomLock.mockResolvedValue(true);
      expect(
        (
          await service.setReady(
            created.data.roomCode,
            created.data.sessionToken,
            true,
          )
        ).ok,
      ).toBe(true);
      expect(redis.saveBalootRoom).toHaveBeenCalledTimes(1);
      expect(redis.releaseBalootRoomLock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not consume a bid command on busy and accepts the same command once after a manual retry', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players)
      await service.setReady(roomCode, player.sessionToken, true);
    await service.startGame(roomCode, players[0].sessionToken);
    const before = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    const player = players[before.bidder];
    const command = {
      commandId: 'retry-busy-bid',
      expectedVersion: before.stateVersion,
      bid: { mode: 'pass' as const },
    };
    const redis = {
      hasSharedStore: () => true,
      acquireBalootRoomLock: jest.fn().mockResolvedValue(false),
      releaseBalootRoomLock: jest.fn(),
      loadBalootRoom: jest.fn().mockResolvedValue(null),
      saveBalootRoom: jest.fn(),
    };
    Object.assign(service, { redis });
    jest.useFakeTimers();
    try {
      const pending = service.bid(roomCode, player.sessionToken, command);
      await jest.advanceTimersByTimeAsync(2_100);
      expect(await pending).toMatchObject({ ok: false, code: 'ROOM_BUSY' });
      expect(redis.saveBalootRoom).not.toHaveBeenCalled();
      redis.acquireBalootRoomLock.mockResolvedValue(true);
      const retried = await service.bid(roomCode, player.sessionToken, command);
      expect(retried.ok).toBe(true);
      if (!retried.ok) throw new Error('manual retry failed');
      expect(retried.data.snapshot.stateVersion).toBe(before.stateVersion + 1);
      await service.bid(roomCode, player.sessionToken, command);
      expect(redis.saveBalootRoom).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  async function fillRoom() {
    const created = await service.createRoom({ playerName: 'Host' });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('room creation failed');

    const players = [created.data];
    for (const playerName of ['Two', 'Three', 'Four']) {
      const joined = await service.joinRoom({
        roomCode: created.data.roomCode,
        playerName,
      });
      expect(joined.ok).toBe(true);
      if (!joined.ok) throw new Error('room join failed');
      players.push(joined.data);
    }
    return { roomCode: created.data.roomCode, players };
  }

  async function reachHokumDoubling(prefix: string) {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    const bidder = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'hokum', trump: 'spades' },
      expectedVersion: bidder.stateVersion,
      commandId: `${prefix}-contract`,
    });
    for (let seat = 1; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `${prefix}-pass-${seat}`,
      });
    }
    return { roomCode, players };
  }

  it.each([0, 1, 2, 3])(
    'completes the deal once when seat %i buys, giving them the exposed card',
    async (buyer) => {
      const { roomCode, players } = await fillRoom();
      for (const player of players)
        await service.setReady(roomCode, player.sessionToken, true);
      await service.startGame(roomCode, players[0].sessionToken);
      const before = await Promise.all(
        players.map((player) =>
          service.getSnapshot(roomCode, player.sessionToken),
        ),
      );
      const purchaseCard = before[0]!.purchaseCard!;
      for (let step = 0; step < buyer + 4; step += 1) {
        const seat = step % 4;
        const snapshot = (await service.getSnapshot(
          roomCode,
          players[seat].sessionToken,
        ))!;
        const result = await service.bid(roomCode, players[seat].sessionToken, {
          bid: step === buyer ? { mode: 'sun' } : { mode: 'pass' },
          expectedVersion: snapshot.stateVersion,
          commandId: `staged-${step}`,
        });
        expect(result.ok).toBe(true);
      }
      const after = await Promise.all(
        players.map((player) =>
          service.getSnapshot(roomCode, player.sessionToken),
        ),
      );
      for (let seat = 0; seat < 4; seat += 1) {
        expect(after[seat]!.phase).toBe('DOUBLING');
        expect(after[seat]!.yourHand).toHaveLength(8);
        expect(after[seat]!.yourHand).toEqual(
          expect.arrayContaining(before[seat]!.yourHand),
        );
        expect(after[seat]!.purchaseCard).toBeNull();
      }
      expect(after[buyer]!.yourHand).toContainEqual(purchaseCard);
      expect(
        new Set(
          after.flatMap((snapshot) =>
            snapshot!.yourHand.map((card) => card.id),
          ),
        ).size,
      ).toBe(32);
      const bidder = after[0]!.bidder;
      const accepted = await service.bid(
        roomCode,
        players[bidder].sessionToken,
        {
          bid: { mode: 'accept' },
          expectedVersion: after[bidder]!.stateVersion,
          commandId: 'staged-accept',
        },
      );
      expect(accepted.ok).toBe(true);
      const playing = (await service.getSnapshot(
        roomCode,
        players[0].sessionToken,
      ))!;
      expect(playing.phase).toBe('PLAYING');
      expect(playing.yourHand).toHaveLength(8);
    },
  );

  it('creates four fixed seats with opposite partners and random session tokens', async () => {
    const { roomCode, players } = await fillRoom();

    expect(new Set(players.map((player) => player.sessionToken)).size).toBe(4);
    expect(
      players.every((player) => /^[a-f0-9]{64}$/.test(player.sessionToken)),
    ).toBe(true);

    const snapshot = await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    );
    expect(snapshot?.phase).toBe('LOBBY');
    expect(snapshot?.seats.map((seat) => [seat.seat, seat.team])).toEqual([
      [0, 'A'],
      [1, 'B'],
      [2, 'A'],
      [3, 'B'],
    ]);
    expect(snapshot?.stateVersion).toBe(4);
    expect(
      await service.joinRoom({ roomCode, playerName: 'Five' }),
    ).toMatchObject({
      ok: false,
      code: 'ROOM_FULL',
    });
  });

  it('requires all players ready and only lets the host start', async () => {
    const { roomCode, players } = await fillRoom();

    for (const player of players) {
      expect(
        (await service.setReady(roomCode, player.sessionToken, true)).ok,
      ).toBe(true);
    }
    expect(
      (await service.getSnapshot(roomCode, players[0].sessionToken))?.phase,
    ).toBe('READY');
    expect(
      await service.startGame(roomCode, players[1].sessionToken),
    ).toMatchObject({
      ok: false,
      code: 'NOT_HOST',
    });
    expect(
      (await service.startGame(roomCode, players[0].sessionToken)).ok,
    ).toBe(true);
    expect(
      (await service.getSnapshot(roomCode, players[0].sessionToken))?.phase,
    ).toBe('BIDDING');
  });

  it('deals every card once and only reveals the viewer hand', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);

    const hands = [];
    for (const player of players) {
      const snapshot = await service.getSnapshot(roomCode, player.sessionToken);
      expect(snapshot?.yourHand).toHaveLength(5);
      expect(snapshot?.seats.every((seat) => !('hand' in seat))).toBe(true);
      expect(snapshot?.purchaseCard).toBeTruthy();
      expect(snapshot).not.toHaveProperty('remainingDeck');
      expect(
        snapshot?.yourHand.some(
          (card) => card.id === snapshot.purchaseCard?.id,
        ),
      ).toBe(false);
      hands.push(snapshot?.yourHand ?? []);
    }
    expect(new Set(hands.flat().map((card) => card.id)).size).toBe(20);
    const hostPayload = JSON.stringify(
      await service.getSnapshot(roomCode, players[0].sessionToken),
    );
    for (const opponentCard of hands.slice(1).flat()) {
      expect(hostPayload).not.toContain(`"id":"${opponentCard.id}"`);
    }
  });

  it('feeds detected projects and Baloot into the authoritative round score', async () => {
    service = new BalootService(undefined, () => 0);
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    const bidding = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'hokum', trump: 'hearts' },
      expectedVersion: bidding.stateVersion,
      commandId: 'scoring-bid',
    });
    for (let seat = 1; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `scoring-pass-${seat}`,
      });
    }
    const doubler = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    await service.bid(roomCode, players[1].sessionToken, {
      bid: { mode: 'accept' },
      expectedVersion: doubler.stateVersion,
      commandId: 'scoring-accept',
    });

    for (let play = 0; play < 32; play += 1) {
      const publicState = (await service.getSnapshot(
        roomCode,
        players[0].sessionToken,
      ))!;
      const seat = publicState.turn!;
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      const [legal] = getLegalPlays(
        snapshot.yourHand,
        snapshot.currentTrick.map((entry) => entry.card),
        snapshot.contract!.mode,
      );
      await service.playCard(roomCode, players[seat].sessionToken, {
        card: legal,
        expectedVersion: snapshot.stateVersion,
        commandId: `scoring-play-${play}`,
      });
    }

    const finished = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    expect(finished.roundScore).not.toBeNull();
    expect(
      finished.roundScore!.teams.reduce(
        (sum, team) => sum + team.projectPoints,
        0,
      ),
    ).toBeGreaterThan(0);
    expect(
      finished.roundScore!.teams.reduce(
        (sum, team) => sum + team.balootPoints,
        0,
      ),
    ).toBe(2);
  });

  it('restores a disconnected seat with its session token and advances stateVersion', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const before = created.data.snapshot.stateVersion;

    expect(await service.disconnect(created.data.sessionToken)).toMatchObject({
      connected: false,
    });
    const reconnected = await service.reconnect({
      sessionToken: created.data.sessionToken,
    });

    expect(reconnected.ok).toBe(true);
    if (!reconnected.ok) return;
    expect(reconnected.data.snapshot.seats[0].connected).toBe(true);
    expect(reconnected.data.snapshot.stateVersion).toBe(before + 2);
    const stable = await service.reconnect({
      sessionToken: reconnected.data.sessionToken,
    });
    expect(stable).toMatchObject({
      ok: true,
      data: {
        sessionToken: reconnected.data.sessionToken,
        snapshot: { stateVersion: before + 2 },
      },
    });
    expect(
      await service.reconnect({ sessionToken: 'not-a-token' }),
    ).toMatchObject({
      ok: false,
      code: 'INVALID_SESSION',
    });
  });

  it('lets a third and fourth player join after two lobby seats disconnect', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const second = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Two',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('second join failed');

    await service.setReady(
      created.data.roomCode,
      created.data.sessionToken,
      true,
    );
    await service.setReady(
      created.data.roomCode,
      second.data.sessionToken,
      true,
    );
    await service.disconnect(second.data.sessionToken);

    const third = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Three',
    });
    const fourth = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Four',
    });

    expect(third.ok).toBe(true);
    expect(fourth.ok).toBe(true);
    const snapshot = await service.getSnapshot(
      created.data.roomCode,
      created.data.sessionToken,
    );
    expect(snapshot?.seats).toHaveLength(4);
    expect(snapshot?.seats.map((seat) => seat.playerName)).toEqual([
      'Host',
      'Two',
      'Three',
      'Four',
    ]);
    expect(snapshot?.phase).toBe('LOBBY');
  });

  it('frees a lobby seat on leave so a new player can take it', async () => {
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const second = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Two',
    });
    if (!second.ok) throw new Error('second join failed');
    await service.leave(second.data.sessionToken);
    const replacement = await service.joinRoom({
      roomCode: created.data.roomCode,
      playerName: 'Three',
    });
    expect(replacement.ok).toBe(true);
    const snapshot = await service.getSnapshot(
      created.data.roomCode,
      created.data.sessionToken,
    );
    expect(snapshot?.seats.map((seat) => seat.playerName)).toEqual([
      'Host',
      'Three',
    ]);
  });

  it('accepts an authoritative bid and rejects stale or duplicate commands', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    const snapshot = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;

    const bid = await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'sun' },
      expectedVersion: snapshot.stateVersion,
      commandId: 'bid-1',
    });

    // After a single SUN bid, the auction is still open: the table is now
    // in BIDDING with the contract set and the buyer established.
    expect(bid).toMatchObject({
      ok: true,
      data: {
        snapshot: {
          phase: 'BIDDING',
          contract: { mode: { mode: 'sun' } },
          buyerPlayerId: 0,
        },
      },
    });
    expect(
      await service.bid(roomCode, players[0].sessionToken, {
        bid: { mode: 'sun' },
        expectedVersion: snapshot.stateVersion,
        commandId: 'bid-1',
      }),
    ).toMatchObject({ ok: false, code: 'DUPLICATE_COMMAND' });
    expect(
      await service.playCard(roomCode, players[0].sessionToken, {
        card: snapshot.yourHand[0],
        expectedVersion: snapshot.stateVersion,
        commandId: 'play-stale',
      }),
    ).toMatchObject({ ok: false, code: 'STALE_VERSION' });
  });

  it('transitions to DOUBLING after three consecutive passes following a contract', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);

    // Seat 0 opens with a SUN contract.
    let snapshot = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'sun' },
      expectedVersion: snapshot.stateVersion,
      commandId: 'open-sun',
    });

    // Seats 1, 2, 3 each pass — the third pass opens the DOUBLING phase.
    for (let seat = 1; seat < 4; seat += 1) {
      snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      const result = await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `close-pass-${seat}`,
      });
      if (seat < 3) {
        expect(result).toMatchObject({
          ok: true,
          data: { snapshot: { phase: 'BIDDING' } },
        });
      } else {
        expect(result).toMatchObject({
          ok: true,
          data: { snapshot: { phase: 'DOUBLING' } },
        });
      }
    }
  });

  it('lets the opponent accept an undoubled contract and starts play at x1', async () => {
    const { roomCode, players } = await reachHokumDoubling('accept-x1');
    const snapshot = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    const accepted = await service.bid(roomCode, players[1].sessionToken, {
      bid: { mode: 'accept' } as never,
      expectedVersion: snapshot.stateVersion,
      commandId: 'accept-x1',
    });

    expect(accepted).toMatchObject({
      ok: true,
      data: { snapshot: { phase: 'PLAYING', contract: { multiplier: 1 } } },
    });
  });

  it('supports double, triple, quadruple and explicit deferred-rule rejections', async () => {
    const { roomCode, players } = await reachHokumDoubling('ladder');
    let snapshot = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    expect(
      await service.bid(roomCode, players[1].sessionToken, {
        bid: { mode: 'double', play: 'locked' } as never,
        expectedVersion: snapshot.stateVersion,
        commandId: 'locked-rejected',
      }),
    ).toMatchObject({ ok: false, code: 'UNSUPPORTED_LOCKED' });

    const doubled = await service.bid(roomCode, players[1].sessionToken, {
      bid: { mode: 'double', play: 'open' } as never,
      expectedVersion: snapshot.stateVersion,
      commandId: 'ladder-double',
    });
    expect(doubled).toMatchObject({
      ok: true,
      data: { snapshot: { contract: { multiplier: 2 } } },
    });
    if (!doubled.ok) throw new Error('double failed');
    expect(
      (await service.getSnapshot(roomCode, players[2].sessionToken))!
        .availableBids,
    ).toContainEqual({ mode: 'accept' });

    snapshot = (await service.getSnapshot(roomCode, players[2].sessionToken))!;
    const tripled = await service.bid(roomCode, players[2].sessionToken, {
      bid: { mode: 'triple' } as never,
      expectedVersion: snapshot.stateVersion,
      commandId: 'ladder-triple',
    });
    expect(tripled).toMatchObject({
      ok: true,
      data: { snapshot: { contract: { multiplier: 3 } } },
    });
    if (!tripled.ok) throw new Error('triple failed');
    expect(
      (await service.getSnapshot(roomCode, players[3].sessionToken))!
        .availableBids,
    ).toContainEqual({ mode: 'accept' });

    snapshot = (await service.getSnapshot(roomCode, players[3].sessionToken))!;
    const quadrupled = await service.bid(roomCode, players[3].sessionToken, {
      bid: { mode: 'quadruple', play: 'open' } as never,
      expectedVersion: snapshot.stateVersion,
      commandId: 'ladder-quadruple',
    });
    expect(quadrupled).toMatchObject({
      ok: true,
      data: { snapshot: { contract: { multiplier: 4 } } },
    });
    if (!quadrupled.ok) throw new Error('quadruple failed');
    expect(
      (await service.getSnapshot(roomCode, players[0].sessionToken))!
        .availableBids,
    ).toContainEqual({ mode: 'accept' });

    snapshot = (await service.getSnapshot(roomCode, players[0].sessionToken))!;
    expect(
      await service.bid(roomCode, players[0].sessionToken, {
        bid: { mode: 'gahwa' } as never,
        expectedVersion: snapshot.stateVersion,
        commandId: 'gahwa-rejected',
      }),
    ).toMatchObject({ ok: false, code: 'UNSUPPORTED_GAHWA' });

    const accepted = await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'accept' } as never,
      expectedVersion: snapshot.stateVersion,
      commandId: 'accept-x4',
    });
    expect(accepted).toMatchObject({
      ok: true,
      data: { snapshot: { phase: 'PLAYING' } },
    });
  });

  it('does not offer a Sun double before the 100-point threshold', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    const bidder = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'sun' },
      expectedVersion: bidder.stateVersion,
      commandId: 'sun-threshold-contract',
    });
    for (let seat = 1; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `sun-threshold-pass-${seat}`,
      });
    }

    const decision = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    expect(decision.availableBids).toEqual([{ mode: 'accept' }]);
    expect(
      await service.bid(roomCode, players[1].sessionToken, {
        bid: { mode: 'double', play: 'open' },
        expectedVersion: decision.stateVersion,
        commandId: 'sun-threshold-illegal-double',
      }),
    ).toMatchObject({ ok: false, code: 'ILLEGAL_BID' });
  });

  it('auto-plays the lowest legal card when the authoritative turn expires', async () => {
    service = new BalootService(undefined, () => 0);
    const { roomCode, players } = await reachHokumDoubling('timeout');
    const decision = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    await service.bid(roomCode, players[1].sessionToken, {
      bid: { mode: 'accept' },
      expectedVersion: decision.stateVersion,
      commandId: 'timeout-accept',
    });
    const before = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    const turn = before.turn!;
    const actor = (await service.getSnapshot(
      roomCode,
      players[turn].sessionToken,
    ))!;
    const expected = selectTimeoutPlay(
      actor.yourHand,
      actor.currentTrick.map((play) => play.card),
      actor.contract!.mode,
    );

    await expect(
      service.playTimedOutTurn(roomCode, before.stateVersion, turn),
    ).resolves.toBe(true);
    const after = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    expect(after.stateVersion).toBeGreaterThan(before.stateVersion);
    expect(after.autoPlayEvents.at(-1)).toMatchObject({
      type: 'AUTO_PLAY',
      reason: 'TURN_TIMEOUT',
      seat: turn,
      card: expected.card,
    });
  });

  it('opens a second auction round after four passes in the first', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    for (let seat = 0; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      expect(
        (
          await service.bid(roomCode, players[seat].sessionToken, {
            bid: { mode: 'pass' },
            expectedVersion: snapshot.stateVersion,
            commandId: `pass-${seat}`,
          })
        ).ok,
      ).toBe(true);
    }

    const after = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    // After four passes in round 1, the auction must open a second round
    // ("حكم ثاني") with the dealer still as the first bidder and SUN locked
    // out of the available bids.
    expect(after.phase).toBe('BIDDING');
    expect(after.auctionRound).toBe(2);
    expect(after.bidder).toBe(0);
    expect(after.yourHand).toHaveLength(5);
    expect(after.availableBids.some((bid) => bid.mode === 'sun')).toBe(false);
    expect(after.availableBids.some((bid) => bid.mode === 'hokum')).toBe(true);
  });

  it('reopens a third round (redeal) only after four passes in round 2', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    // Round 1: four passes.
    for (let seat = 0; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `r1-pass-${seat}`,
      });
    }
    // Round 2: four more passes.
    for (let seat = 0; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `r2-pass-${seat}`,
      });
    }

    const after = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    // After eight total passes (4 + 4), the table must redeal and reset
    // the auction to round 1.
    expect(after.phase).toBe('BIDDING');
    expect(after.auctionRound).toBe(1);
    expect(after.yourHand).toHaveLength(5);

    // The new dealer (next seat after the previous dealer) is now the first
    // bidder and must see the full set of round-1 options, including SUN.
    const nextBidder = after.bidder;
    const bidderSnapshot = (await service.getSnapshot(
      roomCode,
      players[nextBidder].sessionToken,
    ))!;
    expect(bidderSnapshot.availableBids.some((bid) => bid.mode === 'sun')).toBe(
      true,
    );
    expect(
      bidderSnapshot.availableBids.some((bid) => bid.mode === 'hokum'),
    ).toBe(true);
  });

  it('finishes eight tricks and lets the host start the next round', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    const bidding = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'sun' },
      expectedVersion: bidding.stateVersion,
      commandId: 'full-round-bid',
    });
    // The other three players must each pass to close the auction and
    // route the table through DOUBLING.
    for (let seat = 1; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `full-round-pass-${seat}`,
      });
    }
    // Seat 1 accepts the settled contract and starts PLAYING at x1.
    const doublerSnapshot = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    const firstDouble = await service.bid(roomCode, players[1].sessionToken, {
      bid: { mode: 'accept' },
      expectedVersion: doublerSnapshot.stateVersion,
      commandId: 'full-round-accept',
    });
    if (!firstDouble.ok) throw new Error('contract acceptance failed');

    for (let play = 0; play < 32; play += 1) {
      const publicState = (await service.getSnapshot(
        roomCode,
        players[0].sessionToken,
      ))!;
      const seat = publicState.turn!;
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      const legal = getLegalPlays(
        snapshot.yourHand,
        snapshot.currentTrick.map((entry) => entry.card),
        snapshot.contract!.mode,
      );
      expect(
        (
          await service.playCard(roomCode, players[seat].sessionToken, {
            card: legal[0],
            expectedVersion: snapshot.stateVersion,
            commandId: `full-round-${play}`,
          })
        ).ok,
      ).toBe(true);
    }

    const finishedPhase = (
      await service.getSnapshot(roomCode, players[0].sessionToken)
    )?.phase;
    // Only when the match target is reached does the phase become GAME_OVER.
    expect(['ROUND_RESULT', 'GAME_OVER']).toContain(finishedPhase);
    if (finishedPhase !== 'ROUND_RESULT') return;
    const next = await service.nextRound(roomCode, players[0].sessionToken);
    expect(next).toMatchObject({
      ok: true,
      data: { snapshot: { phase: 'BIDDING' } },
    });
    if (!next.ok) throw new Error('next round failed');
    expect(Array.isArray(next.data.snapshot.yourHand)).toBe(true);
  });

  it('enforces turn and legal plays, resolves tricks, and keeps opponent hands private', async () => {
    const { roomCode, players } = await fillRoom();
    for (const player of players) {
      await service.setReady(roomCode, player.sessionToken, true);
    }
    await service.startGame(roomCode, players[0].sessionToken);
    const bidding = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    await service.bid(roomCode, players[0].sessionToken, {
      bid: { mode: 'hokum', trump: 'spades' },
      expectedVersion: bidding.stateVersion,
      commandId: 'bid-hokum',
    });

    // Seats 1, 2, 3 each pass to close the auction and route the table
    // through DOUBLING.
    for (let seat = 1; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      await service.bid(roomCode, players[seat].sessionToken, {
        bid: { mode: 'pass' },
        expectedVersion: snapshot.stateVersion,
        commandId: `bid-hokum-pass-${seat}`,
      });
    }
    // Seat 1 accepts the contract explicitly; no forced escalation is needed.
    const doubler = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    const firstDouble = await service.bid(roomCode, players[1].sessionToken, {
      bid: { mode: 'accept' },
      expectedVersion: doubler.stateVersion,
      commandId: 'accept-contract',
    });
    expect(firstDouble.ok).toBe(true);
    if (!firstDouble.ok) throw new Error('contract acceptance failed');
    expect(firstDouble).toMatchObject({
      ok: true,
      data: { snapshot: { phase: 'PLAYING' } },
    });

    // Confirm a card played out of turn is rejected.
    const playerTwo = (await service.getSnapshot(
      roomCode,
      players[1].sessionToken,
    ))!;
    const playState = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    const expectedTurn = playState.turn!;
    if (expectedTurn !== 1) {
      // Seat 1 isn't currently on lead; playing a card should be rejected
      // because it's not seat 1's turn.
      expect(
        await service.playCard(roomCode, players[1].sessionToken, {
          card: playerTwo.yourHand[0],
          expectedVersion: playerTwo.stateVersion,
          commandId: 'wrong-turn',
        }),
      ).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    }

    for (let seat = 0; seat < 4; seat += 1) {
      const snapshot = (await service.getSnapshot(
        roomCode,
        players[seat].sessionToken,
      ))!;
      if (snapshot.phase !== 'PLAYING') break;
      const legal = getLegalPlays(
        snapshot.yourHand,
        snapshot.currentTrick.map((play) => play.card),
        snapshot.contract!.mode,
      );
      const result = await service.playCard(
        roomCode,
        players[seat].sessionToken,
        {
          card: legal[0],
          expectedVersion: snapshot.stateVersion,
          commandId: `play-${seat}`,
        },
      );
      expect(result.ok).toBe(true);
    }

    const after = (await service.getSnapshot(
      roomCode,
      players[0].sessionToken,
    ))!;
    expect(after.currentTrick).toEqual([]);
    expect(after.trickHistory).toHaveLength(1);
    expect(after.seats.every((seat) => !('hand' in seat))).toBe(true);
    expect(after.yourHand).toHaveLength(7);
  });
});
