import { describe, expect, it } from 'vitest';
import {
  AbandonedPreviewStore,
  PREVIEW_ALPHA,
  PREVIEW_BETA,
} from '../../../e2e/fixtures/abandoned-preview-state';
import { emptyTroops, total } from './simulation';
const now = 1800000000000;
describe('isolated abandoned preview command transport', () => {
  it('serializes concurrent commands and replays an identical request without duplicate troop reservation', async () => {
    const store = new AbandonedPreviewStore(now),
      view = store.view(PREVIEW_ALPHA, 'alice');
    const command = {
      type: 'gatherAbandoned',
      villageId: view.origin.id,
      targetId: view.sites[0]!.id,
      troops: { ...emptyTroops(), guard: 250 },
    };
    await Promise.all([
      store.command(PREVIEW_ALPHA, 'alice', 'same_key_123', command),
      store.command(PREVIEW_ALPHA, 'alice', 'same_key_123', command),
    ]);
    const after = store.view(PREVIEW_ALPHA, 'alice');
    expect(after.movements).toHaveLength(1);
    expect(after.origin.troops.guard).toBe(250);
    expect(after.revision).toBe(1);
    await expect(
      store.command(PREVIEW_ALPHA, 'alice', 'same_key_123', {
        ...command,
        troops: { ...command.troops, guard: 1 },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects cross-world identifiers, foreign troops and nonmember views without mutation', async () => {
    const store = new AbandonedPreviewStore(now),
      alpha = store.view(PREVIEW_ALPHA, 'alice'),
      beta = store.view(PREVIEW_BETA, 'bob');
    const command = {
      type: 'gatherAbandoned',
      villageId: alpha.origin.id,
      targetId: beta.sites[0]!.id,
      troops: { ...emptyTroops(), guard: 10 },
    };
    await expect(
      store.command(PREVIEW_ALPHA, 'alice', 'cross_world_123', command),
    ).rejects.toThrow();
    await expect(
      store.command(PREVIEW_ALPHA, 'bob', 'foreign_army_123', {
        ...command,
        targetId: alpha.sites[0]!.id,
      }),
    ).rejects.toThrow();
    expect(() => store.view(PREVIEW_BETA, 'alice')).toThrow();
    expect(store.view(PREVIEW_ALPHA, 'alice')).toEqual(alpha);
  });
  it('shares one inventory between two actors and keeps both layouts intact while advancing time', async () => {
    const store = new AbandonedPreviewStore(now),
      alpha = store.view(PREVIEW_ALPHA, 'alice'),
      bob = store.view(PREVIEW_ALPHA, 'bob');
    await Promise.all([
      store.command(PREVIEW_ALPHA, 'alice', 'alice_key_123', {
        type: 'gatherAbandoned',
        villageId: alpha.origin.id,
        targetId: alpha.sites[0]!.id,
        troops: { ...emptyTroops(), guard: 250 },
      }),
      store.command(PREVIEW_ALPHA, 'bob', 'bob_key_123', {
        type: 'gatherAbandoned',
        villageId: bob.origin.id,
        targetId: alpha.sites[0]!.id,
        troops: { ...emptyTroops(), guard: 250 },
      }),
    ]);
    const state = store.worlds.get(PREVIEW_ALPHA)!;
    const arrival = Math.max(...state.movements.map((move) => move.arrivesAt));
    state.movements.forEach((move) => {
      move.arrivesAt = arrival;
    });
    await store.advance(arrival - now);
    expect(
      store.worlds.get(PREVIEW_ALPHA)!.movements.reduce((sum, move) => sum + total(move.loot), 0),
    ).toBe(15000);
    await store.advance(3600000);
    expect(store.view(PREVIEW_ALPHA, 'alice').sites[0]!.available.gold).toBe(100);
    expect(
      store.view(PREVIEW_BETA, 'bob').sites.every((site) => site.available.gold === 3000),
    ).toBe(true);
    expect(store.view(PREVIEW_ALPHA, 'alice').sites.map((site) => site.id)).toEqual(
      alpha.sites.map((site) => site.id),
    );
  });
});
