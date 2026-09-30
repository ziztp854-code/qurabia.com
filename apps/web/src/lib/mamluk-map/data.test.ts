import { describe, expect, it } from 'vitest';
import { createGeographicCampaign, geographicCitySeeds } from './data';
import { validateCoordinates } from '@mamluk/world-map-core/server';

describe('real geographic campaign seed', () => {
  it('contains the twelve requested cities in longitude / latitude order', () => {
    expect(geographicCitySeeds.map((city) => city.id)).toEqual([
      'cairo',
      'alexandria',
      'damietta',
      'gaza',
      'jerusalem',
      'damascus',
      'aleppo',
      'homs',
      'hama',
      'tripoli',
      'mecca',
      'medina',
    ]);
    geographicCitySeeds.forEach(validateCoordinates);
    expect(geographicCitySeeds[0]).toMatchObject({ longitude: 31.24967, latitude: 30.06263 });
  });
  it('persists all presentation entities with explicit recipient vision', () => {
    const state = createGeographicCampaign('world', 'alice', 'enemy', 1000);
    expect(state.cities).toHaveLength(12);
    expect(state.armies).toHaveLength(3);
    expect(state.castles).toHaveLength(3);
    expect(state.territories.length).toBeGreaterThan(0);
    expect(state.sultanateTerritories.length).toBeGreaterThan(0);
    expect(state.sieges.length).toBeGreaterThan(0);
    expect(state.visibility.map((grant) => grant.value.region.kind)).toEqual([
      'territory',
      'watchtower',
      'scouting',
      'alliance',
    ]);
    expect(
      state.visibility.every((grant) => grant.value.region.recipientPlayerId === 'alice'),
    ).toBe(true);
    expect(
      state.armies.find((army) => army.value.id === 'enemy-hidden')?.value.position.longitude,
    ).toBe(44.4);
  });
});
