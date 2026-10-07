// Isolated fixture only. No application route imports or constructs these worlds.
import maskJson from './abandoned-middle-east-geography.json';
import { advanceWorld, createWorld, executeCommand } from '../../src/lib/kingdoms/engine';
import { defaultKingdomsConfig, resources } from '../../src/lib/kingdoms/config';
import { emptyTroops } from '../../src/lib/kingdoms/simulation';
import {
  abandonedPlacementDomain,
  parseAbandonedGeographicMask,
} from '../../src/lib/kingdoms/abandoned-village-geography';
import { withAbandonedPreviewVillages } from '../../src/lib/kingdoms/abandoned-village-layout';
import { projectAbandonedVillages } from '../../src/lib/kingdoms/abandoned-villages';
import { kingdomsCommandSchema } from '../../src/lib/kingdoms/commands';
import type { KingdomsWorld } from '../../src/lib/kingdoms/types';

export const PREVIEW_ALPHA = 'preview_abandoned_alpha';
export const PREVIEW_BETA = 'preview_abandoned_beta';
const mask = parseAbandonedGeographicMask(maskJson);
const domain = abandonedPlacementDomain(mask);
export function previewWorld(worldId: string, now: number) {
  let state = createWorld(now, { ...defaultKingdomsConfig, baseProduction: resources() });
  for (const actor of worldId === PREVIEW_ALPHA ? ['alice', 'bob'] : ['bob']) {
    state = executeCommand(
      state,
      actor,
      { type: 'found', name: actor === 'alice' ? 'قرية النيل' : 'قرية الشام' },
      now,
    );
    const home = Object.values(state.villages).find((v) => v.ownerId === actor)!;
    home.troops = { ...emptyTroops(), guard: 500, rider: 100 };
    home.resources = resources();
    home.buildings.warehouse = 20;
  }
  return withAbandonedPreviewVillages(state, worldId, 'isolated_preview_20261007', domain, [
    { longitude: 31.2357, latitude: 30.0444 },
    { longitude: 36.2765, latitude: 33.5138 },
  ]);
}
export class PreviewHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class AbandonedPreviewStore {
  readonly worlds = new Map<string, KingdomsWorld>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly receipts = new Map<string, string>();
  private readonly revisions = new Map<string, number>();
  private offset = 0;
  private readonly clock: () => number;
  get now() {
    return this.clock() + this.offset;
  }
  constructor(now?: number) {
    this.clock = now === undefined ? () => Date.now() : () => now;
    this.worlds.set(PREVIEW_ALPHA, previewWorld(PREVIEW_ALPHA, this.now));
    this.worlds.set(PREVIEW_BETA, previewWorld(PREVIEW_BETA, this.now));
  }
  private world(worldId: string, actor: string) {
    const world = this.worlds.get(worldId);
    if (!world || !Object.hasOwn(world.players, actor))
      throw new PreviewHttpError(404, 'العالم غير متاح لهذا اللاعب');
    return world;
  }
  view(worldId: string, actor: string) {
    const state = advanceWorld(this.world(worldId, actor), this.now);
    return {
      worldId,
      actor,
      serverTime: this.now,
      revision: this.revisions.get(worldId) ?? 0,
      config: state.config,
      sites: projectAbandonedVillages(state, actor, worldId, this.now),
      origin: Object.values(state.villages).find((v) => v.ownerId === actor)!,
      movements: state.movements.filter((m) => m.ownerId === actor),
      reports: state.reports
        .filter((r) => r.recipients.includes(actor))
        .slice(-12)
        .reverse(),
    };
  }
  command(worldId: string, actor: string, key: string, input: unknown) {
    const work = async () => {
      const world = this.world(worldId, actor);
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key))
        throw new PreviewHttpError(400, 'مفتاح الطلب غير صالح');
      const command = kingdomsCommandSchema.parse(input);
      if (command.type !== 'gatherAbandoned')
        throw new PreviewHttpError(403, 'الجمع فقط متاح في هذه المعاينة');
      const receiptKey = `${worldId}:${actor}:${key}`,
        fingerprint = JSON.stringify(command);
      const old = this.receipts.get(receiptKey);
      if (old && old !== fingerprint) throw new PreviewHttpError(409, 'المفتاح مستخدم لأمر مختلف');
      if (!old) {
        const next = executeCommand(world, actor, command, this.now);
        this.worlds.set(worldId, next);
        this.receipts.set(receiptKey, fingerprint);
        this.revisions.set(worldId, (this.revisions.get(worldId) ?? 0) + 1);
      }
      return this.view(worldId, actor);
    };
    const next = (this.queues.get(worldId) ?? Promise.resolve()).then(work, work);
    this.queues.set(
      worldId,
      next.catch(() => undefined),
    );
    return next;
  }
  async advance(milliseconds: number) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 30 * 3600000)
      throw new PreviewHttpError(400, 'إزاحة وقت الاختبار غير صالحة');
    await Promise.all(this.queues.values());
    this.offset += milliseconds;
    for (const [id, world] of this.worlds) this.worlds.set(id, advanceWorld(world, this.now));
  }
}
export function previewBasemap() {
  const collection = (polygons: typeof mask.land) => ({
    type: 'FeatureCollection' as const,
    features: polygons.map((coordinates, index) => ({
      type: 'Feature' as const,
      id: index,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates },
    })),
  });
  return { land: collection(mask.land), water: collection(mask.water) };
}
