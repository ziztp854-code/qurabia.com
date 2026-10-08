import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { plantFarm, farmQuote } from '@/lib/kingdoms/sultan-farm';
import { SultanFarmPanel } from './sultan-farm-panel';
import type { GameProps } from '../shared';

const at = 1700000000000;
function props(level = 1, ripe = false): GameProps {
  const world = executeCommand(
    createWorld(at),
    'owner',
    { type: 'found', name: 'مملكة الاختبار' },
    at,
  );
  const village = Object.values(world.villages)[0];
  village.buildings.farm = level;
  if (ripe)
    plantFarm(
      world.config,
      village,
      2,
      0,
      'wheat',
      at - farmQuote(world.config, level, 'wheat').growMs,
    );
  return {
    view: {
      ...projectWorld(world, 'owner', at),
      worldId: 'test',
      worldName: 'اختبار',
      revision: 1,
      paused: false,
    },
    village,
    busy: false,
    send: vi.fn().mockResolvedValue(undefined),
  };
}
describe('Sultan farm RTL workflow', () => {
  it('renders twelve accessible plots and shows duration, seed cost and yield before planting', () => {
    const p = props();
    render(<SultanFarmPanel {...p} />);
    expect(screen.getByRole('region', { name: 'أحواض مزرعة السلطان' })).toHaveAttribute(
      'dir',
      'rtl',
    );
    expect(
      screen.getByRole('group', { name: 'اختيار الحوض' }).querySelectorAll('button'),
    ).toHaveLength(12);
    expect(screen.getByText('مدة النمو')).toBeInTheDocument();
    expect(screen.getByText('تكلفة البذرة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /فاصوليا/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'الحوض 4، فارغ' }));
    fireEvent.click(screen.getByRole('button', { name: 'زرع قمح' }));
    expect(p.send).toHaveBeenCalledWith({
      type: 'farmPlant',
      villageId: p.village.id,
      plotId: 3,
      expectedVersion: 0,
      crop: 'wheat',
      expectedQuote: farmQuote(p.view.config, 1, 'wheat').quoteKey,
    });
  });
  it('offers an explicit harvest with the current plot generation; no timer awards resources', () => {
    const p = props(5, true);
    render(<SultanFarmPanel {...p} />);
    expect(p.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'الحوض 3، قمح، ناضج' }));
    fireEvent.click(screen.getByRole('button', { name: /حصاد الحوض/ }));
    expect(p.send).toHaveBeenCalledWith({
      type: 'farmHarvest',
      villageId: p.village.id,
      plotId: 2,
      expectedVersion: 1,
    });
  });
  it('explains full storage and disables harvest without discarding the crop', () => {
    const p = props(5, true);
    p.village.resources.food = 999999;
    render(<SultanFarmPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'الحوض 3، قمح، ناضج' }));
    expect(screen.getByText(/المخزن لا يتسع/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /حصاد الحوض/ })).toBeDisabled();
    expect(p.send).not.toHaveBeenCalled();
  });
  it('prevents planting in paused worlds and explains non-viable custom settings', () => {
    const p = props();
    p.view.paused = true;
    render(<SultanFarmPanel {...p} />);
    expect(screen.getByRole('button', { name: 'زرع قمح' })).toBeDisabled();
  });
});
