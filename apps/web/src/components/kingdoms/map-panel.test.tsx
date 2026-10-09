import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { MapPanel } from './map-panel';
import type { MamlukWorldMapProps } from '../mamluk-map/mamluk-world-map';

const map = vi.hoisted(() => ({ props: {} as MamlukWorldMapProps }));
vi.mock('../mamluk-map/mamluk-world-map', () => ({
  MamlukWorldMap: (props: MamlukWorldMapProps) => {
    map.props = props;
    return <div data-testid="unified-map" data-mode={props.mode} />;
  },
}));
afterEach(cleanup);
function fixture() {
  const now = 1800000000000;
  const world = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكتي' }, now);
  const view = { ...projectWorld(world, 'alice', now), worldId: 'world-1', worldName: 'العالم', revision: 0, paused: false };
  return { view, village: view.villages[0], busy: false, send: vi.fn() };
}
describe('unified campaign map', () => {
  it.each(['legacy', 'unmapped-origin'] as const)('keeps the server arrival visible when a %s return has no atlas anchor', (kind) => {
    const props = fixture();
    const arrival = props.view.serverNow + 60000;
    props.view.movements = [{
      id: 'return-without-atlas', ownerId: 'alice', sourceId: props.village.id,
      targetX: props.village.x, targetY: props.village.y, mission: 'return',
      ...(kind === 'unmapped-origin' ? { originX: props.village.x + 1, originY: props.village.y } : {}),
      troops: { ...props.village.troops },
      departedAt: props.view.serverNow, arrivesAt: arrival, travelMs: 60000,
      loot: { stone: 0, wood: 0, iron: 0, food: 0, gold: 0 },
    }];
    render(<MapPanel {...props} />);
    expect(screen.getByText(/لا يتوفر مسار جغرافي موثوق/)).toBeVisible();
    expect(document.querySelector(`time[datetime="${new Date(arrival).toISOString()}"]`)).toBeVisible();
    expect(screen.getByTestId('unified-map')).toBeVisible();
    expect(props.send).not.toHaveBeenCalled();
  });

  it('uses the same geographic component for every mission without replacing its element', () => {
    render(<MapPanel {...fixture()} />);
    const element = screen.getByTestId('unified-map');
    expect(element).toHaveAttribute('data-mode', 'SELECT_ATTACK_TARGET');
    for (const [mission, mode] of [['scout', 'SELECT_SCOUT_TARGET'], ['reinforce', 'SELECT_REINFORCEMENT_TARGET'], ['settle', 'SELECT_SETTLEMENT_TARGET'], ['raid', 'SELECT_ATTACK_TARGET']]) {
      fireEvent.change(screen.getByLabelText('نوع الحملة'), { target: { value: mission } });
      expect(screen.getByTestId('unified-map')).toBe(element);
      expect(element).toHaveAttribute('data-mode', mode);
    }
    expect(screen.queryByLabelText('خريطة الأراضي')).not.toBeInTheDocument();
  });
  it('resolves a confirmed village ID through the existing world projection and sends no command on selection', () => {
    const props = fixture();
    render(<MapPanel {...props} />);
    expect(map.props.initialWorldId).toBe(props.view.worldId);
    expect(map.props.viewerPlayerId).toBe('alice');
    map.props.onConfirmTarget?.('not-in-authorized-world');
    expect(props.send).not.toHaveBeenCalled();
    map.props.onConfirmTarget?.(props.village.id);
    expect(props.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'أرسل الحملة' }));
    expect(props.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'march', villageId: props.village.id, targetX: props.village.x, targetY: props.village.y, mission: 'attack',
    }));
  });
  it('opens the existing campaign map on the mission requested by the rally point', () => {
    render(<MapPanel {...fixture()} initialMission="scout" />);
    expect(screen.getByTestId('unified-map')).toHaveAttribute('data-mode', 'SELECT_SCOUT_TARGET');
    expect(screen.getByLabelText('نوع الحملة')).toHaveValue('scout');
    expect(screen.queryByRole('region', { name: 'نقطة تجمع الجيوش' })).not.toBeInTheDocument();
  });

  it('previews the approved duration and the slowest unit before sending without creating an army', () => {
    const props = fixture();
    props.view.config.armyTravelTimeFactor = 0.45;
    props.view.config.secondsPerTile = 90;
    props.village.troops.siege_tower = 1;
    render(<MapPanel {...props} initialSelection={{ center: props.village, target: { x: props.village.x + 20, y: props.village.y } }} />);
    expect(screen.queryByLabelText('مدة الرحلة المتوقعة')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: /حارس/ }), { target: { value: '1' } });
    expect(screen.getByLabelText('مدة الرحلة المتوقعة')).toHaveAttribute('data-duration-ms', '810000');
    fireEvent.change(screen.getByRole('spinbutton', { name: /برج/ }), { target: { value: '1' } });
    expect(screen.getByLabelText('مدة الرحلة المتوقعة')).toHaveAttribute('data-duration-ms', '2025000');
    expect(props.send).not.toHaveBeenCalled();
  });
});
