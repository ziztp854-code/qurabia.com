import type { HeroCommand, HeroState } from './hero-types';
import type { SystemsCommand, SystemsState } from './systems-types';

export interface RealmState {
  rulesVersion: 1;
  heroes: HeroState;
  systems: SystemsState;
}
export type RealmCommand = HeroCommand | SystemsCommand;
