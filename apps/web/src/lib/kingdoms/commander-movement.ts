import { defaultCommanderConfig } from './commander-config';
import { unitKeys, type Commander, type KingdomsConfig, type Troops } from './types';

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

/** Game-grid tiles, unit speed multiplier and bounded commander bonus. No state is changed. */
export function marchTravelDurationMs(
  config: KingdomsConfig,
  origin: { x: number; y: number },
  target: { x: number; y: number },
  troops: Troops,
  commander?: Pick<Commander, 'mobility'>,
): number | null {
  const units = unitKeys.filter((key) => troops[key] > 0);
  if (!units.length) return null;
  const speed = Math.min(...units.map((key) => config.units[key].speed));
  return Math.max(
    1000,
    Math.ceil(
      (Math.hypot(target.x - origin.x, target.y - origin.y) *
        config.secondsPerTile *
        1000 *
        (config.armyTravelTimeFactor ?? 1)) /
        (speed * commanderTravelFactor(config, commander)),
    ),
  );
}
