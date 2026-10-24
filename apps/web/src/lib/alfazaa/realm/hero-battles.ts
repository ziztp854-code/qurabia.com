import { heroCatalog } from './hero-catalog';
import { resolveHeroBattle } from './hero-combat';
import { reward, spend } from './hero-support';
import type { GameplayContext, GameplayResult, GameEvent } from './common';
import type { HeroState, HeroCommand, HeroBattleReport } from './hero-types';
export function applyHeroBattle(
  state: HeroState,
  command: Extract<HeroCommand, { type: 'hero-battle' | 'hero-rest' }>,
  context: GameplayContext,
): GameplayResult<HeroState> {
  if (command.type === 'hero-rest') {
    if (state.stamina >= 100) throw Error('STAMINA_FULL');
    if (state.restPurchases >= 3) throw Error('REST_LIMIT');
    return {
      ok: true,
      code: 'OK',
      message: 'استعاد الجيش طاقته.',
      state: {
        ...state,
        stamina: Math.min(100, state.stamina + 10),
        restPurchases: state.restPurchases + 1,
      },
      balances: spend(context.balances, [[400001, 500]]),
      events: [{ type: 'stamina-buy', amount: 1 }],
    };
  }
  const stages = heroCatalog.modes.find((x) => x.id === command.mode)!.stages,
    stage = stages.find((x) => x.id === command.stageId);
  if (!stage) throw Error('INVALID_STAGE');
  if (
    context.view.castleLevel < (stage.minCastle ?? 0) ||
    context.view.playerLevel < (stage.minPlayer ?? 0)
  )
    throw Error('STAGE_REQUIREMENT');
  const completed = state.completed[command.mode];
  const next = stages.find((x) => !completed.includes(x.id));
  if (!completed.includes(stage.id) && next?.id !== stage.id) throw Error('STAGE_LOCKED');
  const staminaCost = command.mode === 'campaign' ? 3 : 5;
  if (state.stamina < staminaCost) throw Error('LOW_STAMINA');
  const outcome = resolveHeroBattle(state, stage, context);
  const firstClear = outcome.won && !completed.includes(stage.id);
  const chapterComplete =
    command.mode === 'expedition' &&
    firstClear &&
    stages
      .filter((x) => x.chapter === stage.chapter)
      .every((x) => x.id === stage.id || completed.includes(x.id));
  const gains = firstClear
    ? [...stage.reward, ...(chapterComplete ? (stage.chapterReward ?? []) : [])]
    : [];
  const report: HeroBattleReport = {
    id: state.battleCounter + 1,
    rulesVersion: 1,
    mode: command.mode,
    stageId: stage.id,
    resolvedAt: context.now,
    firstClear,
    staminaCost,
    reward: gains,
    ...outcome,
  };
  const events: GameEvent[] = [
    { type: 'battle-attempt', amount: 1, target: stage.id },
    { type: 'stamina-consume', amount: staminaCost },
    ...outcome.injuries.map((i) => ({
      type: 'troop-wounded',
      amount: 1,
      target: i.cfgId,
      cell: i.cell,
    })),
  ];
  if (outcome.won)
    events.push(
      { type: 'battle-win', amount: 1, target: stage.id },
      {
        type: `${command.mode}-win`,
        amount: 1,
        target: command.mode === 'expedition' ? stages.indexOf(stage) + 1 : stage.id,
        level:
          command.mode === 'expedition' ? stages.indexOf(stage) + 1 : (stage.stage ?? stage.id),
      },
    );
  const eventNames: Record<string, string> = {
    monster: 'worldmonster-win',
    mine: 'mining-capture',
    tower: 'trial-win',
  };
  if (outcome.won && eventNames[command.mode])
    events.push({
      type: eventNames[command.mode],
      amount: 1,
      target: stage.id,
      level: stage.stage ?? stage.id,
    });
  if (command.mode === 'arena' || command.mode === 'battlefield')
    events.push({ type: `${command.mode}-attempt`, amount: 1, target: stage.id });
  if (command.mode === 'expedition')
    events.push({ type: 'expedition-attempt', amount: 1, target: stage.id });
  if (command.mode === 'war') events.push({ type: 'war-training', amount: 1, target: stage.id });
  return {
    ok: true,
    code: 'OK',
    message: outcome.won ? 'انتصر الجيش.' : 'انسحب الجيش؛ عالج المصابين ثم أعد المحاولة.',
    state: {
      ...state,
      stamina: state.stamina - staminaCost,
      battleCounter: report.id,
      lastBattle: report,
      completed: {
        ...state.completed,
        [command.mode]: firstClear ? [...completed, stage.id] : completed,
      },
    },
    balances: reward(context.balances, gains),
    events,
  };
}
