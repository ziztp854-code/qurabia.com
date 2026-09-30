import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  contourPath,
  moveMapCenter,
  riverDistance,
  riverY,
  terrainAt,
  terrainLabel,
  type TerrainKind,
} from './world-terrain';
import { WorldMap } from './world-map';
import { useState, type ComponentProps } from 'react';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const village = (id: string, ownerId: string, name: string, x: number, y: number) => ({
  id,
  ownerId,
  name,
  kingdomName: `مملكة ${name}`,
  x,
  y,
  protectedUntil: 0,
});

function renderMap(props: Partial<ComponentProps<typeof WorldMap>> = {}) {
  const onCenter = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <WorldMap
      center={{ x: 0, y: 0 }}
      target={{ x: 0, y: 0 }}
      radius={100}
      villages={[]}
      territories={{}}
      onCenter={onCenter}
      onSelect={onSelect}
      {...props}
    />,
  );
  const viewport = screen.getByLabelText('مشهد العالم، استخدم الأسهم لتحريك الخريطة');
  return {
    ...view,
    onCenter,
    onSelect,
    viewport,
    scene: viewport.firstElementChild as HTMLElement,
  };
}

describe('world terrain map', () => {
  it('changes physical zoom while preserving the full-name cell floor', () => {
    const { scene } = renderMap({
      villages: [village('v1', 'p1', 'قرية السهول الخضراء وحراس مملكة النور', 0, 0)],
    });
    const physicalSize = () => Number.parseFloat(scene.style.getPropertyValue('--cell-size'));
    const initial = physicalSize();
    fireEvent.click(screen.getByRole('button', { name: 'تكبير الخريطة' }));
    expect(physicalSize()).toBeGreaterThan(initial);
    fireEvent.click(screen.getByRole('button', { name: 'تصغير الخريطة' }));
    expect(physicalSize()).toBe(initial);
    fireEvent.click(screen.getByRole('button', { name: 'تصغير الخريطة' }));
    expect(physicalSize()).toBeLessThan(initial);
    fireEvent.click(screen.getByRole('button', { name: 'تصغير الخريطة' }));
    expect(physicalSize()).toBe(160);
  });
  it('does not mark empty coordinates as owned when no player is supplied', () => {
    const { container } = renderMap();
    expect(container.querySelector('g[data-own="true"]')).toBeNull();
    expect(container.querySelector('button[data-own="true"]')).toBeNull();
  });
  it('shows a long Arabic village name in full and selects its original coordinate', () => {
    const name = 'قرية الواحة الخضراء الشمالية العريقة';
    const { onSelect } = renderMap({ villages: [village('long', 'p1', name, 1, 1)] });
    const tile = screen.getByRole('button', { name: `${name}، X 1، Y 1` });
    expect(screen.getByText(name)).toBeVisible();
    const grid = tile.parentElement!;
    expect(grid.style.gridTemplateColumns).toBe('repeat(9,minmax(0,1fr))');
    expect(grid.style.gridTemplateRows).toBe('repeat(9,minmax(0,1fr))');
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith({ x: 1, y: 1 });
  });
  it('keeps adjacent long village labels inside separate large coordinate cells', () => {
    const names = [
      'قرية السهول الخضراء وحراس مملكة النور',
      'قرية الواحة الشمالية وحراس الأرض العريقة',
    ];
    const { scene, onSelect } = renderMap({
      center: { x: 0, y: -3 },
      villages: names.map((name, index) => village(`v${index}`, 'p1', name, 0, index)),
    });
    expect(scene.style.getPropertyValue('--cell-min')).toBe('160px');
    fireEvent.click(screen.getByText(names[0]));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 0, y: 0 });
    fireEvent.click(screen.getByText(names[1]));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 0, y: 1 });
  });
  it('gives short wide-script village names room for the photo and ownership label', () => {
    const name = 'WWWWWWWWWW';
    const { scene, onSelect } = renderMap({
      playerId: 'p1',
      villages: [village('wide', 'p1', name, 0, 0)],
    });
    expect(scene.style.getPropertyValue('--cell-min')).toBe('128px');
    fireEvent.click(screen.getByText(name));
    expect(onSelect).toHaveBeenCalledWith({ x: 0, y: 0 });
  });
  it('uses a photographed village landmark and keeps terrain anchored when the map center changes', () => {
    const props = { playerId: 'p1', villages: [village('v1', 'p1', 'الواحة', 1, 1)] };
    const { container, rerender, onCenter, onSelect } = renderMap(props);
    const own = screen.getByRole('button', { name: 'الواحة، X 1، Y 1' });
    expect(own).toHaveTextContent('قريتك');
    expect(own.querySelector('image')?.getAttribute('href')).toContain('village-realistic.webp');
    const terrain = container.querySelector('pattern[data-terrain-photo]')!;
    expect(terrain.querySelector('image')?.getAttribute('href')).toContain(
      'world-terrain-realistic.webp',
    );
    const before = Number(terrain.getAttribute('x'));
    rerender(
      <WorldMap
        {...props}
        center={{ x: 1, y: 0 }}
        target={{ x: 0, y: 0 }}
        radius={100}
        territories={{}}
        onCenter={onCenter}
        onSelect={onSelect}
      />,
    );
    expect(Number(container.querySelector('pattern[data-terrain-photo]')!.getAttribute('x'))).toBe(
      before - 90,
    );
  });
  it('distinguishes actionable resource sites from decorative terrain and selects their coordinates', () => {
    const { onSelect } = renderMap({
      resourceSites: [
        {
          id: 'wood:2,2',
          x: 2,
          y: 2,
          resource: 'wood',
          name: 'غابة الخشب',
          available: 450,
          capacity: 600,
          regenerationPerHour: 100,
        },
        {
          id: 'iron:-2,2',
          x: -2,
          y: 2,
          resource: 'iron',
          name: 'منجم الحديد',
          available: 0,
          capacity: 600,
          regenerationPerHour: 100,
        },
      ],
    });
    const wood = screen.getByRole('button', { name: 'غابة الخشب، متاح ٤٥٠ خشب، X 2، Y 2' });
    expect(wood).toHaveTextContent('خشب');
    expect(wood.querySelector('img')?.getAttribute('src')).toContain('resource-wood.webp');
    fireEvent.click(wood);
    expect(onSelect).toHaveBeenCalledWith({ x: 2, y: 2 });
    expect(
      screen.getByRole('button', { name: 'منجم الحديد، ناضب الآن، X -2، Y 2' }),
    ).toHaveTextContent('ناضب');
    expect(screen.getByText(/صور الموارد تحدد مواقع الجمع/)).toBeVisible();
  });
  it('keeps keyboard focus on the viewport when panning removes a focused edge cell', () => {
    function Harness() {
      const [center, setCenter] = useState({ x: 0, y: 0 });
      return (
        <WorldMap
          center={center}
          target={{ x: 0, y: 0 }}
          radius={100}
          villages={[]}
          territories={{}}
          onCenter={setCenter}
          onSelect={vi.fn()}
        />
      );
    }
    render(<Harness />);
    const edge = screen.getByRole('button', { name: 'أرض خالية، X 4، Y 0' });
    edge.focus();
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(
      screen.getByLabelText('مشهد العالم، استخدم الأسهم لتحريك الخريطة'),
    );
  });
  it('keeps terrain and the river anchored to absolute coordinates across viewport changes', () => {
    const first = terrainAt(12, -9);
    for (let x = -30; x < 30; x++) terrainAt(x, 4);
    expect(terrainAt(12, -9)).toEqual(first);
    expect(terrainAt(13, -9)).not.toEqual(first);
    expect(Math.abs(riverY(12.01) - riverY(12))).toBeLessThan(0.1);
    const contour = contourPath({ x: 0, y: 0 }, { x: -3.5, y: -3.5 }, 12, 90, 0.6);
    expect(contourPath({ x: 0, y: 0 }, { x: -3.5, y: -3.5 }, 12, 90, 0.6)).toBe(contour);
  });
  it('produces varied yet geographically continuous biomes and river valleys', () => {
    const counts: Partial<Record<TerrainKind, number>> = {};
    let sameNeighbour = 0;
    let total = 0;
    for (let y = -40; y <= 40; y++)
      for (let x = -40; x <= 40; x++) {
        const kind = terrainAt(x, y).kind;
        counts[kind] = (counts[kind] ?? 0) + 1;
        if (terrainAt(x + 1, y).kind === kind) sameNeighbour++;
        total++;
      }
    expect(Object.keys(counts).sort()).toEqual(['forest', 'hills', 'mountain', 'plain', 'steppe']);
    for (const count of Object.values(counts)) expect(count / total).toBeLessThan(0.45);
    expect(sameNeighbour / total).toBeGreaterThan(0.6);
    expect(riverDistance(7, riverY(7))).toBeCloseTo(0);
    expect(terrainLabel(7, Math.round(riverY(7)))).toBe(
      riverDistance(7, Math.round(riverY(7))) < 0.5 ? 'ضفاف النهر' : expect.any(String),
    );
  });
  it('clamps navigation to both world boundaries', () => {
    expect(moveMapCenter({ x: 9, y: -9 }, 5, -5, 10)).toEqual({ x: 10, y: -10 });
    expect(moveMapCenter({ x: -9, y: 9 }, -5, 5, 10)).toEqual({ x: -10, y: 10 });
  });
  it('selects actual coordinates, exposes real village labels and navigates with controls', () => {
    const { onCenter, onSelect } = renderMap({
      playerId: 'p1',
      villages: [village('v1', 'p1', 'الواحة', 1, 1)],
    });
    fireEvent.click(screen.getByRole('button', { name: 'الواحة، X 1، Y 1' }));
    expect(onSelect).toHaveBeenCalledWith({ x: 1, y: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'تحريك الخريطة شرقًا' }));
    expect(onCenter).toHaveBeenCalledWith({ x: 3, y: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'تكبير الخريطة' }));
    expect(screen.getByRole('button', { name: 'تكبير الخريطة' })).toBeDisabled();
  });
  it('keeps cell semantics independent of the decorative terrain', () => {
    renderMap({
      center: { x: 5, y: 0 },
      target: { x: 5, y: 0 },
      radius: 7,
      territories: { '6,0': 'p2' },
      villages: [village('v2', 'p2', 'الجار', 4, 1)],
    });
    const names = screen
      .getAllByRole('button', { name: /، X -?\d+، Y -?\d+$/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toHaveLength(81);
    for (const name of names)
      expect(name).toMatch(/^(أرض خالية|أرض محتلة|الجار)، X -?\d+، Y -?\d+$/);
    expect(screen.getByRole('button', { name: 'أرض محتلة، X 6، Y 0' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'أرض خالية، X 8، Y 0' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'أرض خالية، X 7، Y 0' })).toBeEnabled();
  });
  it('separates the player’s occupied land and village from other kingdoms', () => {
    const { container } = renderMap({
      playerId: 'p1',
      origin: { x: 0, y: 0 },
      territories: { '1,0': 'p1', '2,0': 'p1', '-1,0': 'p2' },
      villages: [village('v1', 'p1', 'الواحة', 0, 0), village('v2', 'p2', 'الجار', -2, 0)],
    });
    const own = container.querySelector('[data-side="own"] path')!;
    const other = container.querySelector('[data-side="other"] path')!;
    expect(own.getAttribute('d')?.match(/M/g)).toHaveLength(2);
    expect(other.getAttribute('d')?.match(/M/g)).toHaveLength(1);
    expect(container.querySelectorAll('g[data-side="own"] path')).not.toHaveLength(0);
    expect(container.querySelectorAll('[data-own="true"]').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'أرض محتلة، X 1، Y 0' })).toBeInTheDocument();
  });
  it('supports keyboard panning in steps, zoom shortcuts and returning home', () => {
    const { onCenter, viewport } = renderMap({ origin: { x: 20, y: -4 } });
    fireEvent.keyDown(viewport, { key: 'ArrowRight', shiftKey: true });
    expect(onCenter).toHaveBeenLastCalledWith({ x: 3, y: 0 });
    fireEvent.keyDown(viewport, { key: 'Home' });
    expect(onCenter).toHaveBeenLastCalledWith({ x: 20, y: -4 });
    fireEvent.keyDown(viewport, { key: '+' });
    expect(screen.getByRole('button', { name: 'تكبير الخريطة' })).toBeDisabled();
    fireEvent.keyDown(viewport, { key: '-' });
    fireEvent.keyDown(viewport, { key: '-' });
    fireEvent.keyDown(viewport, { key: '-' });
    expect(screen.getByRole('button', { name: 'تصغير الخريطة' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^أرض خالية، X/ })).toHaveLength(169);
  });
  it('pans by whole cells when dragged and does not select the cell under the pointer', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    const { onCenter, onSelect, scene } = renderMap();
    const tile = screen.getByRole('button', { name: 'أرض خالية، X 0، Y 0' });
    fireEvent.pointerDown(tile, {
      pointerId: 1,
      clientX: 500,
      clientY: 500,
      button: 0,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(scene, { pointerId: 1, clientX: 504, clientY: 500 });
    expect(onCenter).not.toHaveBeenCalled();
    fireEvent.pointerMove(scene, { pointerId: 1, clientX: 740, clientY: 380 });
    expect(onCenter).toHaveBeenLastCalledWith({ x: -2, y: 1 });
    fireEvent.pointerUp(scene, { pointerId: 1, clientX: 740, clientY: 380 });
    fireEvent.click(tile);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith({ x: 0, y: 0 });
  });
  it('points to an off-screen home village and previews the route distance', () => {
    const { onCenter } = renderMap({ origin: { x: 20, y: 0 }, target: { x: 0, y: 0 } });
    fireEvent.click(screen.getByRole('button', { name: 'انتقل إلى قريتك، X 20، Y 0' }));
    expect(onCenter).toHaveBeenCalledWith({ x: 20, y: 0 });
    cleanup();
    const { container } = renderMap({ origin: { x: 0, y: 0 }, target: { x: 3, y: 4 } });
    expect(screen.getByText('5.00 خانة')).toBeInTheDocument();
    expect(container.querySelector('[data-route="preview"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^انتقل إلى/ })).toBeNull();
  });
});
