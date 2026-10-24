import { z } from 'zod';
import { unitKeys } from '../../kingdoms/types';
import { capacity } from '../../kingdoms/simulation';
import type { SharedWorld } from './world-engine';

export const allianceCommands = [
  z
    .object({ type: z.literal('alliance-donate'), amount: z.number().int().min(1).max(1e6) })
    .strict(),
  z.object({ type: z.literal('alliance-research') }).strict(),
  z
    .object({
      type: z.literal('alliance-help'),
      villageId: z.string().min(1).max(100),
      itemId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('alliance-boss'),
      unit: z.enum(unitKeys),
      count: z.number().int().min(1).max(10000),
    })
    .strict(),
  z.object({ type: z.literal('alliance-boss-claim') }).strict(),
] as const;
export const allianceCommandSchema = z.discriminatedUnion('type', allianceCommands);
export interface GuildState {
  treasury: number;
  trainingLevel: number;
  donated: Record<string, number>;
  help: Record<string, string[]>;
  boss?: { day: number; hp: number; damage: Record<string, number>; claimed: string[] };
}
export const newGuild = (): GuildState => ({
  treasury: 0,
  trainingLevel: 0,
  donated: {},
  help: {},
});
const day = (now: number) => Math.floor((now + 3 * 3600000) / 86400000);
export function allianceView(world: SharedWorld, actor: string, now: number) {
  const id = world.game.players[actor]?.allianceId;
  if (!id) return null;
  const guild = world.guilds?.[id] ?? newGuild();
  return {
    ...guild,
    boss:
      guild.boss?.day === day(now)
        ? guild.boss
        : { day: day(now), hp: 1000, damage: {}, claimed: [] },
    researchCost: 100 * (guild.trainingLevel + 1),
    trainingBonus: guild.trainingLevel * 0.03,
  };
}
export function applyAllianceCommand(
  input: SharedWorld,
  actor: string,
  raw: unknown,
  now: number,
): SharedWorld {
  const command = allianceCommandSchema.parse(raw);
  const world = structuredClone(input);
  const id = world.game.players[actor]?.allianceId;
  const alliance = id && world.game.alliances[id];
  const village = Object.values(world.game.villages).find((v) => v.ownerId === actor);
  if (!id || !alliance || !village) throw new Error('انضم إلى تحالف أولًا');
  const guild = world.guilds?.[id] ?? newGuild();
  world.guilds = { ...world.guilds, [id]: guild };
  if (command.type === 'alliance-donate') {
    if (village.resources.gold < command.amount) throw new Error('ذهب المخفر غير كافٍ');
    if (guild.treasury + command.amount > 1e9) throw new Error('خزانة التحالف ممتلئة');
    village.resources.gold -= command.amount;
    guild.treasury += command.amount;
    guild.donated[actor] = (guild.donated[actor] ?? 0) + command.amount;
  } else if (command.type === 'alliance-research') {
    if (!['leader', 'officer'].includes(alliance.members[actor]))
      throw new Error('البحث متاح للقائد والضباط');
    const cost = 100 * (guild.trainingLevel + 1);
    if (guild.trainingLevel >= 10 || guild.treasury < cost)
      throw new Error('البحث بلغ الحد أو خزانة التحالف غير كافية');
    guild.treasury -= cost;
    guild.trainingLevel++;
  } else if (command.type === 'alliance-help') {
    const target = world.game.villages[command.villageId];
    const item = target?.constructionQueue?.find(
      (i) => i.id === command.itemId && i.status === 'BUILDING',
    );
    if (
      !target ||
      target.ownerId === actor ||
      world.game.players[target.ownerId]?.allianceId !== id ||
      !item
    )
      throw new Error('اختر بناءً نشطًا لعضو آخر في تحالفك');
    const helpers = guild.help[item.id] ?? [];
    if (helpers.includes(actor) || helpers.length >= 10)
      throw new Error('اكتملت المساعدة أو ساعدت هذا البناء سابقًا');
    item.endsAt = Math.max(now + 1000, item.endsAt - 30000);
    if (target.build) target.build = { ...target.build, endsAt: item.endsAt };
    guild.help[item.id] = [...helpers, actor];
    const live = new Set(
      Object.values(world.game.villages).flatMap((v) =>
        (v.constructionQueue ?? []).filter((i) => i.status === 'BUILDING').map((i) => i.id),
      ),
    );
    guild.help = Object.fromEntries(Object.entries(guild.help).filter(([key]) => live.has(key)));
  } else {
    if (guild.boss?.day !== day(now))
      guild.boss = { day: day(now), hp: 1000, damage: {}, claimed: [] };
    const boss = guild.boss!;
    if (command.type === 'alliance-boss') {
      if (boss.hp === 0) throw new Error('هُزم زعيم اليوم؛ استلم المكافأة إن ساهمت');
      if (village.troops[command.unit] < command.count) throw new Error('جنود المخفر غير كافين');
      const damage = Math.min(
        boss.hp,
        Math.max(1, Math.floor(command.count * world.game.config.units[command.unit].attack)),
      );
      village.troops[command.unit] -= Math.max(1, Math.ceil(command.count * 0.1));
      boss.hp -= damage;
      boss.damage[actor] = (boss.damage[actor] ?? 0) + damage;
    } else {
      if (
        boss.hp > 0 ||
        !boss.damage[actor] ||
        boss.claimed.includes(actor) ||
        world.bossClaims?.[actor] === day(now)
      )
        throw new Error('المكافأة تتطلب مساهمة في هزيمة زعيم اليوم ولم تُستلم سابقًا');
      if (village.resources.gold + 100 > capacity(world.game, village))
        throw new Error('أفرغ مساحة للذهب قبل استلام المكافأة');
      village.resources.gold += 100;
      boss.claimed = [...boss.claimed, actor];
      world.bossClaims = { ...world.bossClaims, [actor]: day(now) };
    }
  }
  return world;
}
