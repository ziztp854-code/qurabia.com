import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const {
  initial,
  act,
  level,
  validSave,
  migrate,
  settle,
  stock,
  reserved,
  defaultPositions,
  recipes,
} = require('../../../public/games/sultan-farm/game.js');

describe('Sultan farm management mini-game', () => {
  it('migrates existing saves without losing currency, crops, buildings or pending production', () => {
    const old = {
      version: 1,
      coins: 93,
      xp: 67,
      harvests: 4,
      deliveries: 2,
      selected: 'carrot',
      plots: [{ crop: 'wheat', start: 1000, ready: 13000 }, null, null, null, null, null],
      inventory: { wheat: 3, carrot: 2, cotton: 1, flour: 1, bread: 0, milk: 0 },
      jobs: { mill: { start: 0, ready: 15000 } },
      orderIds: [0, 1, 2],
      nextOrder: 3,
      claimed: [0],
      buildings: { mill: true, bakery: true, stable: false },
    };
    const migrated = migrate(old);
    expect(validSave(migrated)).toBe(true);
    expect(migrated.coins).toBe(93);
    expect(migrated.plots[0]).toEqual(old.plots[0]);
    expect(migrated.buildings.bakery).toBe(1);
    act(migrated, 'collect', 'mill', 15000);
    expect(migrated.inventory.flour).toBe(2);
    expect(
      migrate({
        ...old,
        plots: [{ crop: 'invalid', start: 0, ready: 12 }, null, null, null, null, null],
      }),
    ).toBeNull();
  });

  it('runs queues serially and can collect completed production after an offline save', () => {
    const state = initial();
    act(state, 'produce', 'flour', 0);
    act(state, 'produce', 'flour', 1000);
    expect(state.jobs.mill.map((j: { ready: number }) => j.ready)).toEqual([15000, 30000]);
    expect(state.inventory.wheat).toBe(0);
    const snapshot = JSON.parse(JSON.stringify(state));
    act(snapshot, 'collect', 'mill', 30000);
    expect(snapshot.inventory.flour).toBe(2);
    expect(snapshot.produced).toBe(2);
    act(snapshot, 'collect', 'mill', 30000);
    expect(snapshot.inventory.flour).toBe(2);
  });

  it('reserves storage for production and prevents losing ripe harvests when full', () => {
    const state = initial();
    for (const k of Object.keys(state.inventory)) state.inventory[k] = 0;
    state.inventory.wheat = 60;
    act(state, 'plot', 0, 0);
    act(state, 'produce', 'flour', 0);
    expect(stock(state) + reserved(state)).toBe(58);
    act(state, 'plot', 0, 12000);
    expect(state.plots[0]).not.toBeNull();
    expect(state.harvests).toBe(0);
    act(state, 'sell', { good: 'wheat', amount: 5 }, 12000);
    act(state, 'plot', 0, 12000);
    expect(state.harvests).toBe(1);
    expect(stock(state) + reserved(state)).toBe(56);
  });

  it('allows free wheat to recover a farm with no money or ingredients', () => {
    const state = initial();
    state.coins = 0;
    act(state, 'plot', 0, 0);
    act(state, 'plot', 0, 12000);
    act(state, 'sell', { good: 'wheat', amount: 1 }, 12000);
    expect(state.coins).toBe(2);
    expect(state.harvests).toBe(1);
  });

  it('checks construction land, settles once and persists moved buildings', () => {
    const state = initial();
    state.xp = 60;
    act(state, 'build', { kind: 'bakery', position: [4, -4] }, 0);
    expect(state.construction.bakery).toBeUndefined();
    act(state, 'build', { kind: 'bakery', position: [0, 0] }, 0);
    expect(state.buildings.bakery).toBe(0);
    settle(state, 18000);
    expect(state.buildings.bakery).toBe(1);
    const xp = state.xp;
    settle(state, 19000);
    expect(state.xp).toBe(xp);
    act(state, 'move', { kind: 'bakery', position: [0, 4] }, 19000);
    expect(state.positions.bakery).toEqual([0, 4]);
    act(state, 'move', { kind: 'bakery', position: [7, -4] }, 19000);
    expect(state.positions.bakery).toEqual([0, 4]);
    expect(validSave(JSON.parse(JSON.stringify(state)))).toBe(true);
  });

  it('requires population for later factories and improves speed through upgrades', () => {
    const state = initial();
    state.xp = 120;
    state.coins = 1000;
    act(state, 'build', 'dairy', 0);
    expect(state.construction.dairy).toBeUndefined();
    act(state, 'upgrade', 'house', 0);
    act(state, 'build', 'dairy', 0);
    expect(state.construction.dairy).toBeDefined();
    act(state, 'upgrade', 'mill', 0);
    act(state, 'produce', 'flour', 0);
    expect(state.jobs.mill[0].ready).toBe(13000);
  });

  it('plays all production chains with their declared inputs and outputs', () => {
    for (const [id, recipe] of Object.entries(recipes) as [
      string,
      {
        building: string;
        input: Record<string, number>;
        output: string;
        amount: number;
        time: number;
      },
    ][]) {
      const state = initial();
      state.xp = 180;
      state.buildings[recipe.building] = 1;
      state.positions[recipe.building] = defaultPositions[recipe.building];
      for (const k of Object.keys(state.inventory)) state.inventory[k] = 0;
      for (const [k, n] of Object.entries(recipe.input)) state.inventory[k] = n;
      act(state, 'produce', id, 0);
      expect(Object.keys(state.jobs)).toContain(recipe.building);
      act(state, 'collect', recipe.building, recipe.time * 1000);
      expect(state.inventory[recipe.output]).toBe(recipe.amount);
      expect(validSave(state)).toBe(true);
    }
  });

  it('returns transport supplies once and consumes them for later barn upgrades', () => {
    const state = initial();
    state.inventory.carrot = 3;
    state.coins = 500;
    act(state, 'trip', 'caravan', 0);
    expect(state.inventory.wheat).toBe(0);
    act(state, 'collectTrip', 'caravan', 34999);
    expect(state.shipments).toBe(0);
    act(state, 'collectTrip', 'caravan', 35000);
    expect(state.shipments).toBe(1);
    expect(state.supplies.wood).toBe(2);
    const coins = state.coins;
    act(state, 'collectTrip', 'caravan', 35000);
    expect(state.coins).toBe(coins);
    act(state, 'barn', undefined, 35000);
    expect(state.capacity).toBe(90);
    act(state, 'barn', undefined, 35000);
    expect(state.capacity).toBe(90);
    state.supplies.brick = 1;
    state.supplies.nails = 1;
    act(state, 'barn', undefined, 35000);
    expect(state.capacity).toBe(120);
    expect(state.supplies.nails).toBe(0);
  });

  it('gives one daily reward and rejects duplicate claims', () => {
    const state = initial(),
      date = Date.UTC(2026, 9, 13, 9);
    act(state, 'daily', undefined, date);
    expect(state.coins).toBe(270);
    act(state, 'daily', undefined, date + 1000);
    expect(state.coins).toBe(270);
    act(state, 'daily', undefined, date + 86400000);
    expect(state.coins).toBe(305);
    expect(state.dailyStreak).toBe(2);
  });
  it('allows same-origin embedding only for the mini-game and keeps the rest of the site protected', () => {
    const config = require('../../../../../vercel.json');
    const global = config.headers.find((rule: { source: string }) => rule.source === '/(.*)');
    const game = config.headers.find(
      (rule: { source: string }) => rule.source === '/games/sultan-farm/index.html',
    );
    expect(global.headers.find((h: { key: string }) => h.key === 'X-Frame-Options').value).toBe(
      'DENY',
    );
    expect(game.headers.find((h: { key: string }) => h.key === 'X-Frame-Options').value).toBe(
      'SAMEORIGIN',
    );
    const policy = game.headers.find(
      (h: { key: string }) => h.key === 'Content-Security-Policy',
    ).value;
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("connect-src 'none'");
    const nextConfig = readFileSync(require.resolve('../../../next.config.ts'), 'utf8');
    expect(nextConfig).toContain("source: '/games/sultan-farm/index.html'");
    expect(nextConfig).toContain(policy);
  });
  it('renders the actual page, plants on click, and saves in a village-specific slot', () => {
    const html = readFileSync(
      require.resolve('../../../public/games/sultan-farm/index.html'),
      'utf8',
    );
    const engine = readFileSync(
      require.resolve('../../../public/games/sultan-farm/game.js'),
      'utf8',
    );
    const page = new JSDOM(
      html
        .replace('<script src="game.js"></script>', `<script>${engine}</script>`)
        .replace(
          '<script src="app.js"></script>',
          `<script>${readFileSync(require.resolve('../../../public/games/sultan-farm/app.js'), 'utf8')}</script>`,
        ),
      {
        url: 'https://example.test/games/sultan-farm/index.html?save=village-one',
        runScripts: 'dangerously',
      },
    );
    try {
      const document = page.window.document as Document;
      expect(document.querySelectorAll('[data-plot]')).toHaveLength(6);
      document.querySelector<HTMLButtonElement>('[data-plot="0"]')!.click();
      const save = JSON.parse(page.window.localStorage.getItem('mamluk-farm-v1:village-one')!);
      expect(save.coins).toBe(240);
      expect(save.plots[0].crop).toBe('wheat');
      expect(page.window.localStorage.getItem('mamluk-farm-v1:village-two')).toBeNull();
      expect(document.querySelector('#toast')!.textContent).toContain('زُرع قمح');
    } finally {
      page.window.dispatchEvent(new page.window.Event('pagehide'));
      page.window.close();
    }
  });

  it('rejects corrupt saves before rendering or resuming timers', () => {
    expect(validSave(initial())).toBe(true);
    expect(validSave({ ...initial(), selected: 'unknown' })).toBe(false);
    expect(validSave({ ...initial(), plots: [] })).toBe(false);
    expect(validSave({ ...initial(), orderIds: [999, 1, 2] })).toBe(false);
    expect(validSave({ ...initial(), inventory: { wheat: -1 } })).toBe(false);
  });
  it('waits for growth, harvests once, and preserves elapsed time through a save', () => {
    const state = initial();
    act(state, 'plot', 0, 1000);
    expect(state.coins).toBe(240);
    act(state, 'plot', 0, 12000);
    expect(state.inventory.wheat).toBe(6);
    const restored = JSON.parse(JSON.stringify(state));
    act(restored, 'plot', 0, 13000);
    expect(restored.inventory.wheat).toBe(9);
    expect(restored.harvests).toBe(1);
    act(restored, 'plot', 0, 13000);
    expect(restored.inventory.wheat).toBe(9);
    expect(restored.plots[0]).not.toBeNull();
  });

  it('consumes ingredients, waits for production, and delivers a completed order once', () => {
    const state = initial();
    act(state, 'produce', 'mill', 0);
    expect(state.inventory.wheat).toBe(3);
    act(state, 'collect', 'mill', 14000);
    expect(state.inventory.flour).toBe(0);
    act(state, 'collect', 'mill', 15000);
    expect(state.inventory.flour).toBe(1);
    state.inventory.wheat = 6;
    act(state, 'deliver', 0, 15000);
    expect(state.inventory.wheat).toBe(0);
    expect(state.coins).toBe(272);
    expect(state.deliveries).toBe(1);
    act(state, 'deliver', 0, 15000);
    expect(state.deliveries).toBe(1);
  });

  it('enforces unlocks, funds and one-time challenge rewards', () => {
    const state = initial();
    act(state, 'build', 'bakery');
    expect(state.buildings.bakery).toBe(0);
    state.xp = 60;
    act(state, 'build', 'bakery', 0);
    expect(state.construction.bakery).toBeDefined();
    settle(state, 18000);
    expect(level(state)).toBe(2);
    expect(state.buildings.bakery).toBe(1);
    expect(state.coins).toBe(155);
    state.coins = 55;
    act(state, 'expand');
    expect(state.plots).toHaveLength(6);
    state.harvests = 3;
    act(state, 'claim', 0);
    act(state, 'claim', 0);
    expect(state.coins).toBe(90);
    act(state, 'expand');
    expect(state.plots).toHaveLength(8);
    expect(state.coins).toBe(10);
  });
});
