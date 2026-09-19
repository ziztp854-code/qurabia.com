import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_REGISTRY, API_REGISTRY } from './registry';

describe('architecture registry', () => {
  it('uses unique ids and resolves every dependency', () => {
    const ids = ARCHITECTURE_REGISTRY.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);

    const known = new Set(ids);
    for (const node of ARCHITECTURE_REGISTRY) {
      expect(node.evidence.length, node.id).toBeGreaterThan(0);
      for (const dependency of node.dependencies) {
        expect(known.has(dependency), `${node.id} -> ${dependency}`).toBe(true);
      }
    }
  });

  it('does not claim unimplemented question games are active', () => {
    for (const id of ['game-category-board', 'game-letter-challenge', 'game-millionaire']) {
      expect(ARCHITECTURE_REGISTRY.find((node) => node.id === id)?.status).not.toBe('ACTIVE');
    }
  });

  it('records only API route handlers that exist in the app router', () => {
    expect(API_REGISTRY.map((api) => `${api.method} ${api.route}`).sort()).toEqual(
      [
        'GET /api/auth/[...nextauth]',
        'POST /api/auth/[...nextauth]',
        'POST /api/live/[sessionId]/room',
        'POST /api/live/[sessionId]/tick',
        'POST /api/mafia/[gameId]/tick',
        'POST /api/presence/heartbeat',
        'GET /api/admin/audience',
      ].sort(),
    );
  });
});
