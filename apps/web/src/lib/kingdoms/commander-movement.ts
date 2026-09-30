import { defaultCommanderConfig } from './commander-config';
import type { Commander, KingdomsConfig } from './types';

/** Read-only preview shared with the server. The authoritative movement freezes its duration. */
export function commanderTravelFactor(
  config: Pick<KingdomsConfig, 'commanders'>,
  commander?: Pick<Commander, 'mobility'>,
): number {
  return commander
    ? 1 +
        Math.min(
          (config.commanders ?? defaultCommanderConfig).maxBonus,
          Math.max(0, commander.mobility / 100),
        )
    : 1;
}
