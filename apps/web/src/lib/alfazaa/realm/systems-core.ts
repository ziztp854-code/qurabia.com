import type { GameplayContext, GameplayResult } from './common';
import type { SystemsCommand, SystemsState } from './systems-types';
import { rejected } from './systems-utils';
import { resetSystemsDay, recordGameEvents } from './systems-state';
import { startResearch } from './systems-research';
import { advanceSystems, startTraining, startHealing, deployTroop } from './systems-queues';
import { craftItem, consumeItem, speedUp } from './systems-inventory';
import { buyOffer, exchangeItem } from './systems-shop';
import { claimQuest, claimDailyBox, prepareDailyChoices } from './systems-quests';
import {
  hatchBeast,
  feedBeast,
  upgradeDestroyer,
  equipRelic,
  upgradeRelic,
  dismantleRelic,
} from './systems-progression';
import { claimEvent } from './systems-events';
import { systemsCommandSchema } from './systems-schema';
export { advanceSystems } from './systems-queues';
export { createSystemsState, validateSystemsState, recordGameEvents } from './systems-state';
export { getSystemsSnapshot, getArmyCap } from './systems-read';
export function applySystemsCommand(
  state: SystemsState,
  command: SystemsCommand,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  try {
    if (!systemsCommandSchema.safeParse(command).success) throw Error('UNKNOWN_COMMAND');
    const advanced = advanceSystems(state, context);
    if (!advanced.ok) return advanced;
    const current = prepareDailyChoices(resetSystemsDay(advanced.state, context.now), {
      ...context,
      balances: advanced.balances,
    });
    const ctx = { ...context, balances: advanced.balances };
    let result: GameplayResult<SystemsState>;
    if (command.type === 'systems-research')
      result = startResearch(current, command.tree, command.id, ctx);
    else if (command.type === 'systems-train')
      result = startTraining(current, command.cfgId, command.count, ctx);
    else if (command.type === 'systems-heal')
      result = startHealing(current, command.cfgId, command.count, ctx);
    else if (command.type === 'systems-deploy') result = deployTroop(current, command.cfgId, ctx);
    else if (command.type === 'systems-craft')
      result = craftItem(current, command.recipeId, command.count, ctx);
    else if (command.type === 'systems-use')
      result = consumeItem(current, command.itemId, command.count, command.choice, ctx);
    else if (command.type === 'systems-speedup')
      result = speedUp(current, command.jobId, command.itemId, command.count, ctx);
    else if (command.type === 'systems-buy')
      result = buyOffer(current, command.offerId, command.count, ctx);
    else if (command.type === 'systems-exchange')
      result = exchangeItem(current, command.itemId, command.count, ctx);
    else if (command.type === 'systems-claim')
      result = claimQuest(current, command.family, command.id, ctx);
    else if (command.type === 'systems-daily-box')
      result = claimDailyBox(current, command.index, ctx);
    else if (command.type === 'systems-beast-hatch')
      result = hatchBeast(current, command.beastId, ctx);
    else if (command.type === 'systems-beast-feed')
      result = feedBeast(current, command.beastId, ctx);
    else if (command.type === 'systems-destroyer-upgrade') result = upgradeDestroyer(current, ctx);
    else if (command.type === 'systems-relic-equip')
      result = equipRelic(current, command.relicId, ctx);
    else if (command.type === 'systems-relic-upgrade')
      result = upgradeRelic(current, command.relicId, ctx);
    else if (command.type === 'systems-relic-dismantle')
      result = dismantleRelic(current, command.relicId, ctx);
    else if (command.type === 'systems-event-claim')
      result = claimEvent(current, command.eventId, command.tier, ctx);
    else if (command.type === 'systems-tick') return { ...advanced, state: current };
    else return rejected(state, context, Error('UNKNOWN_COMMAND'));
    return {
      ...result,
      state: recordGameEvents(result.state, result.events, context.now),
      events: [...advanced.events, ...result.events],
    };
  } catch (error) {
    return rejected(state, context, error);
  }
}
