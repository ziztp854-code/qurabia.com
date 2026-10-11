import { expect, it, vi } from 'vitest';
import { startMapTiming } from './map-diagnostics';

it('records one generic map timing without request or player identifiers', () => {
  const measure = vi.spyOn(performance, 'measure').mockImplementation(() => undefined as never);
  const finish = startMapTiming('viewport');

  finish('failed');
  finish('succeeded');

  expect(measure).toHaveBeenCalledTimes(1);
  expect(measure.mock.calls[0]?.[0]).toBe('qurabia.map.viewport.failed');
  expect(JSON.stringify(measure.mock.calls[0])).not.toContain('worldId');
  measure.mockRestore();
});
