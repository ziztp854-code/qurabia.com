import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { createVillageRenderer } from './village-renderer';
import { CityHubCanvas } from './city-hub-canvas';

vi.mock('./village-renderer', () => ({ createVillageRenderer: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('retains the GPU renderer and camera when a retained desktop city returns in portrait', async () => {
  const renderer = { camera: vi.fn(), update: vi.fn(), hover: vi.fn(), setVisible: vi.fn(), destroy: vi.fn() };
  vi.mocked(createVillageRenderer).mockResolvedValue(renderer);
  const now = 1800000000000;
  const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
  const props = { view, village: view.villages[0], selected: null, onSelect: vi.fn(), quality: 'low' as const, reducedMotion: true, showLabels: false, dedicatedNavigation: true };
  const rendered = render(<CityHubCanvas {...props} active />);
  await act(async () => {});
  const stage = screen.getByRole('region', { name: /مشهد القرية التفاعلي/ });
  expect(createVillageRenderer).toHaveBeenCalledOnce();
  rendered.rerender(<CityHubCanvas {...props} active={false} />);
  Object.defineProperties(stage, { clientWidth: { value: 194, configurable: true }, clientHeight: { value: 345, configurable: true } });
  await act(async () => { rendered.rerender(<CityHubCanvas {...props} active />); });
  expect(stage.getAttribute('data-city-composition')).toBe('portrait');
  expect(createVillageRenderer).toHaveBeenCalledOnce();
  expect(renderer.destroy).not.toHaveBeenCalled();
  expect(renderer.update).toHaveBeenCalledWith(expect.objectContaining({ cityComposition: 'portrait' }), expect.anything());
  rendered.unmount();
  expect(renderer.destroy).toHaveBeenCalledOnce();
});
