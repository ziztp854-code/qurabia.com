import { z } from 'zod';
import { createWorld, executeCommand, advanceWorld, projectWorld } from '../../kingdoms/engine';
import { defaultKingdomsConfig } from '../../kingdoms/config';
import { kingdomsCommandSchema } from '../../kingdoms/commands';
import type { KingdomsWorld } from '../../kingdoms/types';
import { capacity } from '../../kingdoms/simulation';
import { resourceKeys } from '../../kingdoms/types';
import {
  allianceCommands,
  allianceView,
  applyAllianceCommand,
  type GuildState,
} from './world-alliance';

const actions = new Set([
  'build',
  'cancelBuild',
  'train',
  'march',
  'recall',
  'tradeInstant',
  'tradeOffer',
  'tradeAccept',
  'tradeCancel',
  'allianceCreate',
  'allianceJoin',
  'allianceApprove',
  'allianceReject',
  'allianceKick',
  'allianceRole',
  'allianceLeave',
  'diplomacy',
  'caravanSend',
  'caravanCancel',
  'commanderRecruit',
  'commanderAssign',
  'commanderUnassign',
]);
export const worldCommandSchema = z.discriminatedUnion('type', [
  ...allianceCommands,
  z.object({ type: z.literal('join'), name: z.string().trim().min(2).max(40) }).strict(),
  z
    .object({
      type: z.literal('outpost'),
      action: kingdomsCommandSchema.refine(
        (action) => actions.has(action.type),
        'أمر غير متاح في عالم الفزعة',
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal('deposit-gold'),
      amount: z.number().int().min(1).max(1e9),
      expectedCityRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('withdraw-gold'),
      amount: z.number().int().min(1).max(1e9),
      expectedCityRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('convert-troop'),
      cell: z.number().int().min(0).max(35),
      confirm: z.literal(true),
      expectedCityRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type WorldCommand = z.infer<typeof worldCommandSchema>;
export interface SharedWorld {
  version: 1;
  game: KingdomsWorld;
  progress: Record<
    string,
    { victories: number; gathered: number; gatheredResources?: Record<string, number> }
  >;
  seenReports: string[];
  guilds?: Record<string, GuildState>;
  bossClaims?: Record<string, number>;
  questSync?: Record<string, Record<string, number>>;
  questJoined?: Record<string, true>;
}
export function createSharedWorld(now: number): SharedWorld {
  const config = structuredClone(defaultKingdomsConfig);
  config.worldRadius = 40;
  config.maxVillages = 1;
  config.seasonSeconds = 365 * 86400;
  config.protectionSeconds = 120;
  config.secondsPerTile = 3;
  config.armyTravelTimeFactor = 1;
  config.defaultRegions = [];
  config.startingResources.gold = 0;
  const game = createWorld(now, config);
  // This persistent world has no automatic season reset or destructive rollover.
  game.season.endsAt = 8e12;
  return { version: 1, game, progress: {}, seenReports: [] };
}
export function advanceSharedWorld(state: SharedWorld, now: number): SharedWorld {
  const game = advanceWorld(state.game, now);
  const progress = structuredClone(state.progress);
  const seen = new Set(state.seenReports);
  for (const report of game.reports) {
    if (seen.has(report.id)) continue;
    seen.add(report.id);
    const event = report.event;
    if (event?.key === 'battle.resolved' && event.outcome === 'victory' && event.attackerId) {
      const p = progress[event.attackerId] ?? { victories: 0, gathered: 0 };
      progress[event.attackerId] = { ...p, victories: p.victories + 1 };
    }
    if (event?.key === 'gather.returned')
      for (const id of report.recipients) {
        const p = progress[id] ?? { victories: 0, gathered: 0 };
        progress[id] = {
          ...p,
          gatheredResources: Object.fromEntries(
            resourceKeys.map((key) => [
              key,
              (p.gatheredResources?.[key] ?? 0) +
                Math.max(0, event.resources?.received?.[key] ?? 0),
            ]),
          ),
          gathered:
            p.gathered + Object.values(event.resources?.received ?? {}).reduce((a, b) => a + b, 0),
        };
      }
  }
  return { ...state, game, progress, seenReports: [...seen].slice(-2500) };
}
export function applySharedCommand(
  state: SharedWorld,
  actor: string,
  raw: unknown,
  now: number,
): SharedWorld {
  const command = worldCommandSchema.parse(raw);
  if (command.type.startsWith('alliance-'))
    return applyAllianceCommand(advanceSharedWorld(state, now), actor, command, now);
  if (command.type !== 'join' && command.type !== 'outpost')
    throw new Error('يحتاج هذا الأمر إلى معاملة المدينة');
  if (command.type === 'join' && Object.keys(state.game.players).length >= 200)
    throw new Error('العالم ممتلئ');
  const advanced = advanceSharedWorld(state, now);
  if (command.type === 'outpost' && command.action.type === 'tradeAccept') {
    const trade = command.action;
    const offer = advanced.game.offers.find((o) => o.id === trade.offerId);
    const buyer = advanced.game.villages[trade.villageId];
    const seller = offer && advanced.game.villages[offer.villageId];
    if (
      offer &&
      buyer?.ownerId === actor &&
      seller &&
      resourceKeys.some(
        (k) =>
          buyer.resources[k] - offer.want[k] + offer.give[k] > capacity(advanced.game, buyer) ||
          seller.resources[k] + offer.want[k] > capacity(advanced.game, seller),
      )
    )
      throw new Error('لا تتسع مخازن أحد الطرفين؛ لم يُستهلك العرض');
  }
  let action =
    command.type === 'join' ? { type: 'found' as const, name: command.name } : command.action;
  if (action.type === 'march' && !action.commanderId) {
    const id = advanced.game.villages[action.villageId]?.commanderId;
    const commander = id ? advanced.game.commanders?.[id] : undefined;
    if (
      commander?.playerId === actor &&
      commander.status === 'assigned' &&
      (commander.cooldownUntil ?? 0) <= now
    )
      action = { ...action, commanderId: commander.id };
  }
  const game = executeCommand(advanced.game, actor, action, now);
  if (command.type === 'outpost' && command.action.type === 'train') {
    const village = game.villages[command.action.villageId];
    const bonus = allianceView(advanced, actor, now)?.trainingBonus ?? 0;
    if (village.training && bonus > 0)
      village.training = {
        ...village.training,
        endsAt: now + Math.ceil((village.training.endsAt - now) * (1 - bonus)),
      };
  }
  return advanceSharedWorld({ ...advanced, game }, now);
}
export const projectSharedWorld = (state: SharedWorld, actor: string, now: number) => ({
  ...projectWorld(state.game, actor, now),
  progress: state.progress[actor] ?? { victories: 0, gathered: 0 },
  guild: allianceView(state, actor, now),
  allianceHelp: state.game.players[actor]?.allianceId
    ? Object.values(state.game.villages)
        .filter(
          (v) =>
            v.ownerId !== actor &&
            state.game.players[v.ownerId]?.allianceId === state.game.players[actor].allianceId,
        )
        .flatMap((v) =>
          (v.constructionQueue ?? [])
            .filter((i) => i.status === 'BUILDING')
            .map((i) => ({ villageId: v.id, itemId: i.id, name: v.name, endsAt: i.endsAt })),
        )
    : [],
});
