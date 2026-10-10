import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { citySceneAsset, citySceneForBuilding } from './city-scenes';
import { getCityPlacement } from '@/lib/kingdoms/village/city-composition';
import { SultanGardenEntrance, sultanGardenEntranceRect } from './sultan-garden-entrance';

describe('Independent palace garden entrance', () => {
  it('opens the decorative scene from one accessible target; the food farm keeps its building and artwork', () => {
    const world = executeCommand(
      createWorld(1700000000000),
      'owner',
      { type: 'found', name: 'Garden' },
      1700000000000,
    );
    const village = Object.values(world.villages)[0];
    const view = {
      ...projectWorld(world, 'owner', 1700000000000),
      worldId: 'test',
      worldName: 'test',
      paused: false,
      revision: 0,
    };
    const open = vi.fn();
    render(
      <SultanGardenEntrance composition="desktop" view={view} village={village} onOpen={open} />,
    );
    const entrance = screen.getByRole('button', { name: /افتح حديقة السلطان/ });
    const rect = sultanGardenEntranceRect('desktop');
    expect(entrance).toHaveStyle({ left: `${rect.x}px`, top: `${rect.y}px` });
    fireEvent.click(entrance);
    expect(open).toHaveBeenCalledTimes(1);
    expect(citySceneForBuilding('farm')).toBe('farm');
    expect(citySceneAsset('farm')).toMatch(/\/farm.webp$/);
    expect(citySceneAsset('sultan-garden')).toContain('/sultan-farm-user.webp');
    expect(citySceneAsset('sultan-garden', true)).toContain('/sultan-farm-user-mobile.webp');
    for (const composition of ['desktop', 'portrait'] as const) {
      const rect = sultanGardenEntranceRect(composition);
      expect(rect.width).toBeGreaterThan(200);
      // Browser touch adjustment must not redirect an embassy tap to the garden.
      expect(rect.x - getCityPlacement('embassy', composition).focusX).toBeGreaterThan(40);
      expect(rect.height).toBeGreaterThan(70);
    }
  });
});
