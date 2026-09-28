import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terrainAt, moveMapCenter, riverY } from './world-terrain';
import { WorldMap } from './world-map';
import { useState } from 'react';
afterEach(cleanup);
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
  });
  it('clamps navigation to both world boundaries', () => {
    expect(moveMapCenter({ x: 9, y: -9 }, 5, -5, 10)).toEqual({ x: 10, y: -10 });
    expect(moveMapCenter({ x: -9, y: 9 }, -5, 5, 10)).toEqual({ x: -10, y: 10 });
  });
  it('selects actual coordinates, exposes real village labels and navigates with controls', () => {
    const onCenter = vi.fn();
    const onSelect = vi.fn();
    render(
      <WorldMap
        center={{ x: 0, y: 0 }}
        target={{ x: 0, y: 0 }}
        radius={100}
        playerId="p1"
        villages={[
          {
            id: 'v1',
            ownerId: 'p1',
            name: 'الواحة',
            kingdomName: 'مملكتي',
            x: 1,
            y: 1,
            protectedUntil: 0,
          },
        ]}
        territories={{}}
        onCenter={onCenter}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'الواحة، X 1، Y 1' }));
    expect(onSelect).toHaveBeenCalledWith({ x: 1, y: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'تحريك الخريطة شرقًا' }));
    expect(onCenter).toHaveBeenCalledWith({ x: 3, y: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'تكبير الخريطة' }));
    expect(screen.getByRole('button', { name: 'تكبير الخريطة' })).toBeDisabled();
  });
});
