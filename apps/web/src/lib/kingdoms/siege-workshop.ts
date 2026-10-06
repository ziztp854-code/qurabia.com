import { z } from 'zod';
import { resourceKeys, type Resources, type Village } from './types';

export const equipmentKeys = ['catapult', 'ballista', 'siege-tower'] as const;
export type Equipment = (typeof equipmentKeys)[number];
export const workshopRecipes: Record<
  Equipment,
  { name: string; level: number; seconds: number; cost: Resources }
> = {
  catapult: {
    name: 'منجنيق',
    level: 1,
    seconds: 600,
    cost: { wood: 800, stone: 300, iron: 200, food: 80, gold: 100 },
  },
  ballista: {
    name: 'مقلاع',
    level: 2,
    seconds: 900,
    cost: { wood: 1000, stone: 100, iron: 500, food: 100, gold: 150 },
  },
  'siege-tower': {
    name: 'برج حصار',
    level: 3,
    seconds: 1800,
    cost: { wood: 2500, stone: 300, iron: 800, food: 200, gold: 400 },
  },
};
export const workshopLevels = [
  { hall: 2, cost: { wood: 400, stone: 300, iron: 200, food: 0, gold: 100 } },
  { hall: 4, cost: { wood: 800, stone: 600, iron: 400, food: 0, gold: 200 } },
  { hall: 6, cost: { wood: 1600, stone: 1200, iron: 800, food: 0, gold: 400 } },
] satisfies { hall: number; cost: Resources }[];
const id = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const key = z
  .string()
  .min(1)
  .max(74)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const workshopReadSchema = z.object({ worldId: id, villageId: id }).strict();
export const workshopActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('upgrade'), key }).strict(),
  z
    .object({
      type: z.literal('craft'),
      key,
      equipment: z.enum(equipmentKeys),
      count: z.number().int().min(1).max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal('repair'),
      key,
      equipment: z.enum(equipmentKeys),
      count: z.number().int().min(1).max(10),
    })
    .strict(),
]);
export type WorkshopAction = z.infer<typeof workshopActionSchema>;
export const workshopRequestSchema = workshopReadSchema
  .extend({ action: workshopActionSchema })
  .strict();
const inventorySchema = z
  .object({
    catapult: z.number().int().min(0).max(10000),
    ballista: z.number().int().min(0).max(10000),
    'siege-tower': z.number().int().min(0).max(10000),
  })
  .strict();
const queueItemSchema = z
  .object({
    id: key,
    kind: z.enum(['craft', 'repair']).default('craft'),
    equipment: z.enum(equipmentKeys),
    count: z.number().int().min(1).max(10),
    startedAt: z.number().int().min(0),
    endsAt: z.number().int().min(0),
  })
  .strict();
export const workshopStateSchema = z
  .object({
    version: z.literal(1),
    level: z.number().int().min(0).max(3),
    inventory: inventorySchema,
    damaged: inventorySchema.default({ catapult: 0, ballista: 0, 'siege-tower': 0 }),
    queue: z.array(queueItemSchema).max(3),
    receipts: z.array(z.object({ key, fingerprint: z.string().max(500) }).strict()).max(100),
  })
  .strict();
export type WorkshopState = z.infer<typeof workshopStateSchema>;
export type WorkshopVillage = Village & { siegeWorkshop?: WorkshopState };

const emptyWorkshop = (): WorkshopState => ({
  version: 1,
  level: 0,
  inventory: { catapult: 0, ballista: 0, 'siege-tower': 0 },
  damaged: { catapult: 0, ballista: 0, 'siege-tower': 0 },
  queue: [],
  receipts: [],
});
const stateOf = (village: WorkshopVillage) =>
  village.siegeWorkshop ? workshopStateSchema.parse(village.siegeWorkshop) : emptyWorkshop();
function rule(ok: unknown, message: string): asserts ok {
  if (!ok) {
    const error = new Error(message);
    error.name = 'KingdomsError';
    throw error;
  }
}

/** Settled only by the authenticated repository with authoritative server time. */
export function settleWorkshop(village: WorkshopVillage, now: number): WorkshopVillage {
  const state = stateOf(village);
  const completed = state.queue.filter((item) => item.endsAt <= now);
  if (!completed.length) return village;
  const inventory = Object.fromEntries(
    equipmentKeys.map((equipment) => [
      equipment,
      state.inventory[equipment] +
        completed
          .filter((item) => item.equipment === equipment)
          .reduce((sum, item) => sum + item.count, 0),
    ]),
  ) as WorkshopState['inventory'];
  return {
    ...village,
    siegeWorkshop: { ...state, inventory, queue: state.queue.filter((item) => item.endsAt > now) },
  };
}

export function projectWorkshop(village: WorkshopVillage, serverNow: number) {
  const { level, inventory, damaged, queue } = stateOf(village);
  return {
    serverNow,
    level,
    inventory,
    damaged,
    queue,
    resources: village.resources,
    hallLevel: village.buildings.hall,
    recipes: workshopRecipes,
    nextLevel: workshopLevels[level] ?? null,
  };
}

export function applyWorkshopAction(
  village: WorkshopVillage,
  input: unknown,
  now: number,
): WorkshopVillage {
  const action = workshopActionSchema.parse(input);
  const state = stateOf(village);
  const fingerprint = JSON.stringify(action);
  const previous = state.receipts.find((receipt) => receipt.key === action.key);
  if (previous) {
    rule(previous.fingerprint === fingerprint, 'مفتاح الطلب مستخدم لأمر آخر.');
    return village;
  }
  let cost: Resources;
  let nextState: WorkshopState;
  if (action.type === 'upgrade') {
    const spec = workshopLevels[state.level];
    rule(spec, 'بلغت الورشة المستوى الأعلى.');
    rule(village.buildings.hall >= spec.hall, `تحتاج دار حكم بالمستوى ${spec.hall}.`);
    cost = spec.cost;
    nextState = { ...state, level: state.level + 1 };
  } else {
    const spec = workshopRecipes[action.equipment];
    rule(state.level >= spec.level, `تحتاج ورشة بالمستوى ${spec.level}.`);
    rule(state.queue.length < 3, 'طابور التصنيع ممتلئ.');
    const queued = state.queue
      .filter((item) => item.equipment === action.equipment)
      .reduce((sum, item) => sum + item.count, 0);
    if (action.type === 'repair')
      rule(state.damaged[action.equipment] >= action.count, 'لا توجد معدات متضررة بهذا العدد.');
    rule(
      state.inventory[action.equipment] + queued + action.count <= 10000,
      'بلغ مخزون المعدات الحد الأعلى.',
    );
    const factor = action.type === 'repair' ? 0.25 : 1;
    cost = Object.fromEntries(
      resourceKeys.map((resource) => [
        resource,
        Math.ceil(spec.cost[resource] * action.count * factor),
      ]),
    ) as Resources;
    const startedAt = Math.max(now, ...state.queue.map((item) => item.endsAt));
    const endsAt =
      startedAt +
      Math.ceil(
        (spec.seconds * action.count * 1000 * (action.type === 'repair' ? 0.5 : 1)) /
          (1 + (state.level - 1) * 0.2),
      );
    const damaged =
      action.type === 'repair'
        ? { ...state.damaged, [action.equipment]: state.damaged[action.equipment] - action.count }
        : state.damaged;
    nextState = {
      ...state,
      damaged,
      queue: [
        ...state.queue,
        {
          id: action.key,
          kind: action.type,
          equipment: action.equipment,
          count: action.count,
          startedAt,
          endsAt,
        },
      ],
    };
  }
  rule(
    resourceKeys.every((resource) => village.resources[resource] >= cost[resource]),
    'الموارد غير كافية.',
  );
  const resources = Object.fromEntries(
    resourceKeys.map((resource) => [resource, village.resources[resource] - cost[resource]]),
  ) as Resources;
  return {
    ...village,
    resources,
    siegeWorkshop: {
      ...nextState,
      receipts: [...state.receipts.slice(-99), { key: action.key, fingerprint }],
    },
  };
}
