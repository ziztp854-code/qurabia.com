import type { AlfazaaState } from './types';
import { getGoldPerMinute } from './state';

/** Settle the old rate before a timed production modifier changes. */
export function bankProduction(state: AlfazaaState, now: number, bonus: number): AlfazaaState {
  const minutes = Math.max(0, Math.min(720, Math.floor((now - state.lastCollectedAt) / 60000)));
  const rate = Math.floor(getGoldPerMinute(state) * (1 + Math.max(0, Math.min(10, bonus))));
  return { ...state, lastCollectedAt: now, balances: { ...state.balances,
    '400001': Math.min(1e12, (state.balances['400001'] ?? 0) + minutes * rate) } };
}
