import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { initial, act, level, validSave } = require('../../../public/games/sultan-farm/game.js');

describe('Sultan farm management mini-game', () => {
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
      html.replace('<script src="game.js"></script>', `<script>${engine}</script>`),
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
      expect(save.coins).toBe(138);
      expect(save.plots[0].crop).toBe('wheat');
      expect(page.window.localStorage.getItem('mamluk-farm-v1:village-two')).toBeNull();
      expect(document.querySelector('#toast')!.textContent).toContain('زُرع قمح');
    } finally {
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
    expect(state.coins).toBe(138);
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
    act(state, 'produce', 'mill', 14000);
    expect(state.inventory.flour).toBe(0);
    act(state, 'produce', 'mill', 15000);
    expect(state.inventory.flour).toBe(1);
    state.inventory.wheat = 6;
    act(state, 'deliver', 0, 15000);
    expect(state.inventory.wheat).toBe(0);
    expect(state.coins).toBe(172);
    expect(state.deliveries).toBe(1);
    act(state, 'deliver', 0, 15000);
    expect(state.deliveries).toBe(1);
  });

  it('enforces unlocks, funds and one-time challenge rewards', () => {
    const state = initial();
    act(state, 'build', 'bakery');
    expect(state.buildings.bakery).toBe(false);
    state.xp = 60;
    act(state, 'build', 'bakery');
    expect(level(state)).toBe(2);
    expect(state.buildings.bakery).toBe(true);
    expect(state.coins).toBe(55);
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
