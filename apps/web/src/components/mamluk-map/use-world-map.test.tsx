import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MapSdkFixture, approvedPayload } from './map-fixture';
import { useWorldMap } from './use-world-map';

vi.mock('maplibre-gl', async () => {
  const { MapSdkFixture } = await import('./map-fixture');
  return { Map: MapSdkFixture, setWorkerUrl: vi.fn() };
});

afterEach(() => {
  vi.unstubAllGlobals();
  MapSdkFixture.instances = [];
});

it('keeps one map and its accepted settlement sources when equal initial coordinates are recreated', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  function Scene({ location }: { location: { longitude: number; latitude: number } }) {
    const { container } = useWorldMap('world', 'viewer', location);
    return <div ref={container} />;
  }
  const view = render(<Scene location={{ longitude: 31.2, latitude: 30 }} />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0]!;
  const cities = map.sources.get('mamluk-cities');
  await act(async () => view.rerender(<Scene location={{ longitude: 31.2, latitude: 30 }} />));
  expect(MapSdkFixture.instances).toHaveLength(1);
  expect(map.removed).toBe(false);
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  view.unmount();
});

it('moves the existing camera to changed authoritative coordinates without replacing the map', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  function Scene({ longitude }: { longitude: number }) {
    const { container } = useWorldMap('world', 'viewer', { longitude, latitude: 30 }, 'cairo');
    return <div ref={container} />;
  }
  const view = render(<Scene longitude={31.2} />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0]!;
  await act(async () => view.rerender(<Scene longitude={31.5} />));
  expect(MapSdkFixture.instances).toHaveLength(1);
  expect(map.lastCamera).toMatchObject({ center: [31.5, 30] });
  view.unmount();
});

it('never displays the previous viewer public presentation during a session change', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'X-Mamluk-Public-Settlements': '1' }),
        json: async () => approvedPayload(),
      })
      .mockImplementation(() => new Promise(() => {})),
  );
  function Scene({ viewer }: { viewer: string }) {
    const { container, publicPayload } = useWorldMap('world', viewer);
    return (
      <>
        <div ref={container} />
        <output>
          {(publicPayload?.layers.cities.features[0]?.properties.name as string) ?? ''}
        </output>
      </>
    );
  }
  const view = render(<Scene viewer="viewer" />);
  await screen.findByText('القاهرة');
  view.rerender(<Scene viewer="other-viewer" />);
  expect(screen.queryByText('القاهرة')).not.toBeInTheDocument();
  await waitFor(() => expect(MapSdkFixture.instances).toHaveLength(2));
  expect(MapSdkFixture.instances[0]?.removed).toBe(true);
  view.unmount();
});
