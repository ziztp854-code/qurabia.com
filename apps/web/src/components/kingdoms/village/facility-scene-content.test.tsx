import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { emptyTroops } from '@/lib/kingdoms/simulation';
import { trainingBuilding } from '@/lib/kingdoms/training';
import { unitKeys } from '@/lib/kingdoms/types';
import type { GameProps, WorldView } from '../shared';
import { FacilitySceneContent } from './facility-scene-content';

const now = 1800000000000;
function fixture(): GameProps {
  const world = executeCommand(createWorld(now), 'player-1', { type: 'found', name: 'سلطنة النور' }, now);
  const view: WorldView = {
    ...projectWorld(world, 'player-1', now), worldId: 'world-1', worldName: 'العالم', paused: false, revision: 0,
  };
  const village = {
    ...view.villages[0],
    buildings: { ...view.villages[0].buildings, barracks: 2, stable: 2 },
    troops: { ...emptyTroops(), guard: 5, rider: 3, scout: 2 },
    resources: { wood: 10000, stone: 10000, iron: 10000, food: 10000, gold: 10000 },
  };
  return { view: { ...view, villages: [village] }, village, busy: false, send: vi.fn(async () => {}) };
}
const navigation = { onClose: vi.fn(), onSelectScene: vi.fn(), onNavigate: vi.fn() };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Dedicated facilities preserve production gameplay', () => {
  it('trains configured barracks troops through the existing command and excludes stable troops', () => {
    const props = fixture();
    render(<FacilitySceneContent {...props} {...navigation} scene="barracks" />);
    fireEvent.change(screen.getByRole('spinbutton', { name: `عدد ${props.view.config.units.guard.name}` }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: `درّب ${props.view.config.units.guard.name}` }));
    expect(props.send).toHaveBeenCalledWith({ type: 'train', villageId: props.village.id, unit: 'guard', count: 2 });
    for (const unit of unitKeys.filter((unit) => trainingBuilding(unit) === 'stable')) {
      expect(screen.queryByRole('spinbutton', { name: `عدد ${props.view.config.units[unit].name}` })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/يتطلب المستوطن دار حكم/)).toBeInTheDocument();
  });

  it('blocks recruitment while the authoritative world is paused', () => {
    const props = fixture();
    render(<FacilitySceneContent {...props} view={{ ...props.view, paused: true }} {...navigation} scene="barracks" />);
    expect(screen.getByRole('button', { name: `درّب ${props.view.config.units.guard.name}` })).toBeDisabled();
  });

  it('retains independent stable upgrades and cavalry training', () => {
    const props = fixture();
    render(<FacilitySceneContent {...props} {...navigation} scene="stable" />);
    expect(screen.getByRole('heading', { name: /الإسطبل/ })).toBeInTheDocument();
    expect(screen.getByText(/مستوى الإسطبل/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'طوّر الإسطبل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درّب الفرسان' })).toBeEnabled();
  });

  it('trains mounted archers from their dedicated stable scene through the authoritative command', () => {
    const props = fixture();
    render(<FacilitySceneContent {...props} {...navigation} scene="stable" />);
    fireEvent.change(screen.getByRole('combobox', { name: 'وحدة الإسطبل' }), {
      target: { value: 'mounted_archer' },
    });
    const unit = props.view.config.units.mounted_archer;
    fireEvent.change(screen.getByRole('spinbutton', { name: `عدد ${unit.name}` }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: `درّب ${unit.name}` }));
    expect(props.send).toHaveBeenCalledWith({
      type: 'train', villageId: props.village.id, unit: 'mounted_archer', count: 2,
    });
  });

  it('opens production campaign missions and routes recruitment to its independent scene', () => {
    const props = fixture();
    const onCampaign = vi.fn();
    render(<FacilitySceneContent {...props} {...navigation} scene="war-council" onCampaign={onCampaign} />);
    fireEvent.click(screen.getByRole('button', { name: 'إرسال جيش' }));
    expect(onCampaign).toHaveBeenCalledWith('attack');
    fireEvent.click(screen.getByRole('button', { name: 'استطلاع' }));
    expect(onCampaign).toHaveBeenCalledWith('scout');
    fireEvent.click(screen.getByRole('button', { name: 'إرسال تعزيزات' }));
    expect(onCampaign).toHaveBeenCalledWith('reinforce');
    fireEvent.click(screen.getByRole('button', { name: 'الذهاب إلى التدريب' }));
    expect(navigation.onSelectScene).toHaveBeenCalledWith('barracks');
    expect(screen.queryByRole('button', { name: /أصدر أمر هجوم/ })).not.toBeInTheDocument();
  });
});
