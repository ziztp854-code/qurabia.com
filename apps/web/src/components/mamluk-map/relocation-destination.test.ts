import { describe, expect, it } from 'vitest';
import { normalizeDestination, validateDestination } from './relocation-destination';

describe('relocation destination coordinates', () => {
  it('keeps manually entered precision so existing Arabic decimal drafts do not get rewritten', () => {
    const destination = { longitude: 51.5310404123, latitude: 25.2854474567 };
    expect(validateDestination(destination)).toEqual(destination);
    expect(validateDestination(destination)).not.toBe(destination);
    expect(validateDestination({ longitude: 181, latitude: 25 })).toBeNull();
  });
  it('uses finite geographic coordinates with longitude wrapping and stable precision', () => {
    expect(normalizeDestination({ longitude: 411.5310404, latitude: 25.2854474 })).toEqual({
      longitude: 51.53104,
      latitude: 25.285447,
    });
    expect(normalizeDestination({ longitude: -181, latitude: -85 })).toEqual({
      longitude: 179,
      latitude: -85,
    });
  });

  it.each([
    { longitude: Number.NaN, latitude: 25 },
    { longitude: 51, latitude: Infinity },
    { longitude: 51, latitude: 86 },
    { longitude: 51, latitude: -86 },
    { longitude: 180, latitude: 0 },
  ])('rejects coordinates outside the supported world: %o', (destination) => {
    expect(normalizeDestination(destination)).toBeNull();
  });
});
