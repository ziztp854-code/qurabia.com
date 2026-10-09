import { describe, expect, it } from 'vitest';
import { defaultKingdomsConfig } from './config';
import { marchTravelDurationMs } from './commander-movement';
import { gatherPreview } from './resource-sites';
import { emptyTroops } from './simulation';
import type { KingdomsConfig, Troops } from './types';

const origin = { x: 0, y: 0 };
const historicalConfig = { ...defaultKingdomsConfig, armyTravelTimeFactor: 1 };
const cases: { name: string; troops: Troops; durations: number[]; reviewDurations: number[] }[] = [
  {
    name: 'guards',
    troops: { ...emptyTroops(), guard: 5 },
    durations: [90000, 900000, 4500000],
    reviewDurations: [40500, 405000, 2025000],
  },
  {
    name: 'riders',
    troops: { ...emptyTroops(), rider: 5 },
    durations: [50000, 500000, 2500000],
    reviewDurations: [22500, 225000, 1125000],
  },
  {
    name: 'scouts',
    troops: { ...emptyTroops(), scout: 5 },
    durations: [36000, 360000, 1800000],
    reviewDurations: [16200, 162000, 810000],
  },
  {
    name: 'guards with riders',
    troops: { ...emptyTroops(), guard: 1, rider: 99 },
    durations: [90000, 900000, 4500000],
    reviewDurations: [40500, 405000, 2025000],
  },
  {
    name: 'settler with guards',
    troops: { ...emptyTroops(), settler: 1, guard: 5 },
    durations: [128572, 1285715, 6428572],
    reviewDurations: [57858, 578572, 2892858],
  },
  {
    name: 'siege tower with riders',
    troops: { ...emptyTroops(), siege_tower: 1, rider: 99 },
    durations: [225000, 2250000, 11250000],
    reviewDurations: [101250, 1012500, 5062500],
  },
];

describe('Shared server/client travel preview in game-grid tiles', () => {
  it.each(cases)(
    'applies the local 0.45 review policy for $name without rounding the original leg first',
    ({ troops, reviewDurations }) => {
      expect(
        [1, 10, 50].map((distance) =>
          marchTravelDurationMs(defaultKingdomsConfig, origin, { x: distance, y: 0 }, troops),
        ),
      ).toEqual(reviewDurations);
    },
  );

  it('keeps standalone legacy configuration without a factor on its historical formula', () => {
    const legacyConfig: KingdomsConfig = structuredClone(defaultKingdomsConfig);
    delete legacyConfig.armyTravelTimeFactor;
    expect(
      marchTravelDurationMs(legacyConfig, origin, { x: 10, y: 0 }, { ...emptyTroops(), guard: 1 }),
    ).toBe(900000);
  });

  it.each(cases)('keeps current 1, 10 and 50 tile durations for $name', ({ troops, durations }) => {
    expect(
      [1, 10, 50].map((distance) =>
        marchTravelDurationMs(historicalConfig, origin, { x: distance, y: 0 }, troops),
      ),
    ).toEqual(durations);
  });

  it('uses Euclidean grid distance and the slowest present unit, independently from quantity', () => {
    expect(
      marchTravelDurationMs(historicalConfig, { x: -3, y: -4 }, origin, {
        ...emptyTroops(),
        guard: 1,
        rider: 100,
      }),
    ).toBe(450000);
    expect(
      marchTravelDurationMs(historicalConfig, { x: -3, y: -4 }, origin, {
        ...emptyTroops(),
        guard: 100,
        rider: 1,
      }),
    ).toBe(450000);
  });

  it('uses the supplied world setting and bounds the commander bonus without changing input', () => {
    const config = { ...structuredClone(historicalConfig), secondsPerTile: 120 };
    const saved = structuredClone(config);
    const troops = { ...emptyTroops(), guard: 1 };
    expect(marchTravelDurationMs(config, origin, { x: 10, y: 0 }, troops)).toBe(1200000);
    expect(marchTravelDurationMs(config, origin, { x: 10, y: 0 }, troops, { mobility: 5 })).toBe(
      1142858,
    );
    expect(
      marchTravelDurationMs(config, origin, { x: 10, y: 0 }, troops, { mobility: 100000 }),
    ).toBe(1043479);
    expect(config).toEqual(saved);
  });

  it('returns no ETA for an empty army and enforces the existing one second minimum', () => {
    expect(
      marchTravelDurationMs(historicalConfig, origin, { x: 10, y: 0 }, emptyTroops()),
    ).toBeNull();
    expect(
      marchTravelDurationMs(
        defaultKingdomsConfig,
        origin,
        { x: 0.001, y: 0 },
        { ...emptyTroops(), rider: 1 },
      ),
    ).toBe(1000);
  });

  it('uses the same commander ETA for gathering and includes both frozen travel legs', () => {
    const troops = { ...emptyTroops(), guard: 1, rider: 1 };
    const target = { x: 3, y: 4 };
    const commander = { mobility: 5 };
    expect(gatherPreview(historicalConfig, origin, target, troops, commander)).toEqual({
      carry: 140,
      travelMs: 428572,
      roundTripMs: 857144,
    });
    expect(gatherPreview(historicalConfig, origin, target, troops, commander).travelMs).toBe(
      marchTravelDurationMs(historicalConfig, origin, target, troops, commander),
    );
  });
});
