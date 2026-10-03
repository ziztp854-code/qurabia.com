/** Presentation modes only; callers retain all mission validation and execution. */
export type MapMode =
  | 'WORLD'
  | 'SELECT_ATTACK_TARGET'
  | 'SELECT_SCOUT_TARGET'
  | 'SELECT_REINFORCEMENT_TARGET'
  | 'SELECT_SETTLEMENT_TARGET';
