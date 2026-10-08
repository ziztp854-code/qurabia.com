import { expect, it } from 'vitest';
import { createPalaceQualityMonitor } from './palace-quality';
it('lowers AUTO after two sustained overloaded windows, then never loops back up', () => {
  const high = createPalaceQualityMonitor('high');
  expect(high.sample(150, 3500, 3500)).toBeNull();
  expect(high.sample(160, 3500, 3500)).toBe('medium');
  const medium = createPalaceQualityMonitor('medium');
  expect(medium.sample(103, 3500, 3500)).toBeNull();
  expect(medium.sample(103, 3500, 3500)).toBeNull();
});
it('ignores a transient slow frame window and resets after paused/offscreen/background time', () => {
  const high = createPalaceQualityMonitor('high');
  expect(high.sample(100, 3500, 3500)).toBeNull();
  expect(high.sample(210, 3500, 3500)).toBeNull();
  expect(high.sample(100, 3500, 3500)).toBeNull();
  expect(high.sample(30, 3500, 1000)).toBeNull();
  expect(high.sample(100, 3500, 3500)).toBeNull();
});
it('lowers a persistently overloaded medium mode to low, while low remains bounded', () => {
  const medium = createPalaceQualityMonitor('medium');
  expect(medium.sample(65, 3500, 3500)).toBeNull();
  expect(medium.sample(65, 3500, 3500)).toBe('low');
  const low = createPalaceQualityMonitor('low');
  expect(low.sample(20, 3500, 3500)).toBeNull(); expect(low.sample(20, 3500, 3500)).toBeNull();
});
