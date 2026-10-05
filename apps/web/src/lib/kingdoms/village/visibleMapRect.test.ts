import { expect, it } from 'vitest';
import { visibleMapAnchor } from './visibleMapRect';

it('centers selection in the map space remaining beside an RTL desktop rail', () => {
  expect(visibleMapAnchor({ x: 0, y: 0, width: 1200, height: 800 }, { width: 1200, height: 800 }, [
    { x: 900, y: 0, width: 300, height: 800 },
  ])).toEqual({ x: 450, y: 400 });
});

it('excludes the phone sheet and screen area above a partially scrolled map', () => {
  expect(visibleMapAnchor({ x: 0, y: -100, width: 390, height: 800 }, { width: 390, height: 844 }, [
    { x: 0, y: 500, width: 390, height: 344 },
  ])).toEqual({ x: 195, y: 350 });
});

it('ignores closed/off-map overlays and leaves a valid anchor if all map space is covered', () => {
  const map = { x: 10, y: 20, width: 390, height: 500 };
  expect(visibleMapAnchor(map, { width: 800, height: 600 }, [{ x: 600, y: 0, width: 50, height: 50 }]))
    .toEqual({ x: 195, y: 250 });
  expect(visibleMapAnchor(map, { width: 800, height: 600 }, [map]))
    .toEqual({ x: 195, y: 250 });
});
