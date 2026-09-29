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
