import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { FastestButtonService } from './fastest-button.service';
import { RedisService } from '../game/redis.service';
import { startFastestRound } from '@tahaddi/domain';
const url = process.env.FASTEST_TEST_REDIS_URL;
const integration = url ? describe : describe.skip;
integration('Fastest Button Redis atomic integration', () => {
  let store: RedisService;
  let secondStore: RedisService;
  let secondGame: FastestButtonService;
  let game: FastestButtonService;
  let cleanup: Redis;
  const codes: string[] = [];
  beforeAll(() => {
    store = new RedisService(new ConfigService({ REDIS_URL: url }));
    store.onModuleInit();
    game = new FastestButtonService(store);
    secondStore = new RedisService(new ConfigService({ REDIS_URL: url }));
    secondStore.onModuleInit();
    secondGame = new FastestButtonService(secondStore);
    cleanup = new Redis(url!);
  });
  afterAll(async () => {
    for (const code of codes) {
      await cleanup.del(`fastest:room:${code}`);
      await cleanup.zrem('fastest:deadlines', code);
    }
    await cleanup.quit();
    await store.onModuleDestroy();
    await secondStore.onModuleDestroy();
  });
  async function room(
    mode: 'classic' | 'points' | 'elimination' = 'classic',
    count = 2,
    totalRounds = 1,
  ) {
    const room = await game.create('host', {
      mode,
      totalRounds,
      responseSeconds: 10,
      countdownSeconds: 2,
    });
    codes.push(room.code);
    const players = [];
    for (let i = 0; i < count; i++)
      players.push(await game.join(room.code, `لاعب ${i}`, `s${i}`));
    return { code: room.code, players };
  }
  async function active(code: string) {
    return game.update(code, (state, now) => {
      const next = startFastestRound(state, randomUUID(), now);
      return {
        ...next,
        phase: 'active',
        round: { ...next.round!, startAt: now - 10, endAt: now + 10_000 },
      };
    });
  }
  it('creates unique six-digit codes atomically', async () => {
    const rooms = await Promise.all(
      Array.from({ length: 30 }, () =>
        game.create('host', {
          mode: 'classic',
          totalRounds: 1,
          responseSeconds: 3,
          countdownSeconds: 2,
        }),
      ),
    );
    codes.push(...rooms.map((r) => r.code));
    expect(new Set(rooms.map((r) => r.code)).size).toBe(30);
    expect(rooms.every((r) => /^\d{6}$/.test(r.code))).toBe(true);
  });
  it('proves a single classic winner for simultaneous valid presses', async () => {
    const { code, players } = await room('classic', 16);
    const current = await active(code);
    const results = await Promise.allSettled(
      players.map((p, i) =>
        (i % 2 ? secondGame : game).press(
          code,
          current.round!.id,
          p.identity.playerId,
          `s${i}`,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const state = await game.get(code);
    expect(state?.round?.presses).toHaveLength(1);
    expect(state?.rounds).toHaveLength(1);
    expect(state?.round?.winnerId).toBe(state?.round?.presses[0].playerId);
  });
  it('records every points press once with unique sequence and persists exact scoring', async () => {
    const { code, players } = await room('points', 8);
    const current = await active(code);
    await Promise.all(
      players.map((p, i) =>
        (i % 2 ? secondGame : game).press(
          code,
          current.round!.id,
          p.identity.playerId,
          `s${i}`,
        ),
      ),
    );
    const state = (await game.get(code))!;
    expect(state.phase).toBe('finished');
    expect(state.round!.presses).toHaveLength(8);
    expect(state.round!.presses.map((p) => p.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(state.players.map((p) => p.score).sort((a, b) => b - a)).toEqual([
      10, 7, 5, 1, 1, 1, 1, 1,
    ]);
    await expect(
      game.press(code, current.round!.id, players[0].identity.playerId, 's0'),
    ).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    const restarted = new FastestButtonService(store);
    expect((await restarted.get(code))?.rounds).toEqual(state.rounds);
  });
  it('rejects early, stale, expired, duplicate and non-member presses', async () => {
    const { code, players } = await room('points', 3);
    const waiting = await game.command(code, 'host', 'start');
    await expect(
      game.press(code, waiting.round!.id, players[0].identity.playerId, 's0'),
    ).rejects.toMatchObject({ code: 'TOO_EARLY' });
    const current = await game.update(code, (r, now) => ({
      ...r,
      phase: 'active',
      round: { ...r.round!, startAt: now - 1, endAt: now + 5000 },
    }));
    await expect(
      game.press(code, randomUUID(), players[0].identity.playerId, 's0'),
    ).rejects.toMatchObject({ code: 'STALE_ROUND' });
    await expect(
      game.press(code, current.round!.id, randomUUID(), 'bad'),
    ).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
    await game.press(
      code,
      current.round!.id,
      players[0].identity.playerId,
      's0',
    );
    await expect(
      game.press(code, current.round!.id, players[0].identity.playerId, 's0'),
    ).rejects.toMatchObject({ code: 'ALREADY_PRESSED' });
    await game.update(code, (r, now) => ({
      ...r,
      round: { ...r.round!, endAt: now - 1 },
    }));
    await expect(
      game.press(code, current.round!.id, players[1].identity.playerId, 's1'),
    ).rejects.toMatchObject({ code: 'TOO_LATE' });
    await game.tick(code);
    expect((await game.get(code))?.players.map((p) => p.score)).toEqual([
      10, 0, 0,
    ]);
  });
  it('recovers deadline transitions from the persistent schedule after a service restart', async () => {
    const { code } = await room('elimination');
    await active(code);
    await game.update(code, (r, now) => ({
      ...r,
      round: { ...r.round!, endAt: now - 1 },
    }));
    const restarted = new FastestButtonService(store);
    expect(await restarted.dueRooms()).toContain(code);
    const result = await restarted.tick(code);
    expect(result?.phase).toBe('results');
    expect(result?.round?.cancelled).toBe(true);
    expect(result?.players.every((p) => !p.eliminated)).toBe(true);
  });
  it('requires the host owner and never reveals private identities on a public snapshot', async () => {
    const { code, players } = await room();
    await expect(game.command(code, 'intruder', 'start')).rejects.toMatchObject(
      { code: 'HOST_ONLY' },
    );
    const state = (await game.get(code))!;
    const snapshot = game.snapshot(state, await game.clock());
    const raw = JSON.stringify(snapshot);
    expect(raw).not.toContain('tokenHash');
    expect(raw).not.toContain('hostId');
    expect(raw).not.toContain(players[0].identity.token);
    expect(raw).not.toContain('connections');
    expect(snapshot.players).toHaveLength(2);
  });
  it('resumes the same identity, preserves other tabs and forbids forged tokens', async () => {
    const { code, players } = await room();
    const player = players[0];
    await game.resume(code, player.identity.token, 'new-socket');
    await game.presence(code, player.identity.playerId, 's0', false);
    const state = (await game.get(code))!;
    expect(game.snapshot(state, await game.clock()).players[0].connected).toBe(
      true,
    );
    expect(state.players).toHaveLength(2);
    await expect(
      game.resume(code, 'A'.repeat(43), 'forged'),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    await game.command(
      code,
      'host',
      'remove',
      undefined,
      player.identity.playerId,
    );
    await expect(
      game.resume(code, player.identity.token, 'removed'),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION' });
  });
  it('does not lose simultaneous participant registrations under CAS contention', async () => {
    const r = await game.create('host', {
      mode: 'points',
      totalRounds: 1,
      responseSeconds: 10,
      countdownSeconds: 2,
    });
    codes.push(r.code);
    await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        game.join(r.code, `متسابق ${i}`, `register-${i}`),
      ),
    );
    expect((await game.get(r.code))?.players).toHaveLength(24);
  });
  it('retains the recorded winner name after host removal without keeping the participant eligible', async () => {
    const { code, players } = await room('classic', 2);
    const current = await active(code);
    await game.press(
      code,
      current.round!.id,
      players[0].identity.playerId,
      's0',
    );
    const removed = await game.command(
      code,
      'host',
      'remove',
      undefined,
      players[0].identity.playerId,
    );
    const view = game.snapshot(removed, await game.clock());
    expect(
      view.players.find((p) => p.id === view.round?.winnerId),
    ).toMatchObject({ name: 'لاعب 0', removed: true });
    const next = await game.command(code, 'host', 'start');
    expect(next.round?.eligibleIds).not.toContain(players[0].identity.playerId);
  });
});
