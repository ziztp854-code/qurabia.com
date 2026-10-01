import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('reviews a temporary map destination without relocating or rebuilding the canvas and clears it on selection or viewer changes', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() });
  vi.stubGlobal('fetch', fetch);
  function Scene({ viewer = 'viewer' }: { viewer?: string }) {
    const map = useWorldMap('world', viewer, undefined, 'cairo');
    return <>
      <div ref={map.container} />
      <button onClick={map.startPickingDestination}>pick</button>
      <button onClick={map.reviewDestination}>review</button>
      <button onClick={map.cancelDestination}>cancel</button>
      <button onClick={() => map.setSelected(null)}>close</button>
      <button onClick={() => map.setSelected({ layer: 'cities', id: 'cairo' })}>select</button>
      <output>{map.destination ? `${map.destination.longitude}/${map.destination.latitude}` : 'none'}</output>
      <output>{map.isPickingDestination ? 'picking' : 'reviewing'}</output>
    </>;
  }
  const view = render(<Scene />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0];
  fireEvent.click(screen.getByText('pick'));
  await screen.findByText('picking');
  await act(async () => map.fire('click', { lngLat: { lng: 51.53104, lat: 25.285447 }, point: { x: 1, y: 1 } }));
  expect(screen.getByText('51.53104/25.285447')).toBeInTheDocument();
  await act(async () => map.fire('moveend'));
  expect(screen.getByText('51.53104/25.285447')).toBeInTheDocument();
  fireEvent.click(screen.getByText('review'));
  expect(screen.getByText('reviewing')).toBeInTheDocument();
  expect(map.canvas.style.cursor).toBe('');
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  expect(MapSdkFixture.instances).toHaveLength(1);
  fireEvent.click(screen.getByText('close'));
  expect(screen.getByText('none')).toBeInTheDocument();
  expect(map.sources.has('qurabia-relocation-preview')).toBe(false);
  fireEvent.click(screen.getByText('select'));
  fireEvent.click(screen.getByText('pick'));
  await act(async () => map.fire('click', { lngLat: { lng: 51.6, lat: 25.3 }, point: { x: 1, y: 1 } }));
  expect(screen.getByText('51.6/25.3')).toBeInTheDocument();
  view.rerender(<Scene viewer="other-viewer" />);
  expect(screen.getByText('none')).toBeInTheDocument();
  expect(screen.getByText('reviewing')).toBeInTheDocument();
  expect(map.sources.has('qurabia-relocation-preview')).toBe(false);
  view.rerender(<Scene viewer="viewer" />);
  expect(screen.getByText('none')).toBeInTheDocument();
  view.unmount();
});

it('offers map-center keyboard picking and manual review while keeping the same map', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }));
  function Scene() {
    const map = useWorldMap('world', 'viewer', undefined, 'cairo');
    return <>
      <div ref={map.container} />
      <button onClick={map.startPickingDestination}>pick</button>
      <button onClick={map.useMapCenterDestination}>center</button>
      <button onClick={map.requestManualDestination}>manual</button>
      <button onClick={() => map.changeDestination({ longitude: 51.5310404123, latitude: 25.2854474567 })}>edit</button>
      <button onClick={() => map.setProjection('mercator')}>projection</button>
      <button onClick={map.cancelDestination}>cancel</button>
      <output>{map.destination ? `${map.destination.longitude}/${map.destination.latitude}` : 'none'}</output>
      <output>{map.isPickingDestination ? 'picking' : 'reviewing'}</output>
      <output>{map.manualEntryRequested ? 'manual visible' : 'manual hidden'}</output>
    </>;
  }
  const view = render(<Scene />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0];
  Object.defineProperties(map.canvas, { clientWidth: { value: 102 }, clientHeight: { value: 50 } });
  fireEvent.click(screen.getByText('pick'));
  fireEvent.click(screen.getByText('center'));
  expect(screen.getByText('51/25')).toBeInTheDocument();
  expect(screen.getByText('picking')).toBeInTheDocument();
  fireEvent.click(screen.getByText('projection'));
  await act(async () => {});
  expect(screen.getByText('51/25')).toBeInTheDocument();
  fireEvent.click(screen.getByText('manual'));
  expect(screen.getByText('reviewing')).toBeInTheDocument();
  expect(screen.getByText('manual visible')).toBeInTheDocument();
  fireEvent.click(screen.getByText('edit'));
  expect(screen.getByText('51.5310404123/25.2854474567')).toBeInTheDocument();
  expect(map.sources.get('qurabia-relocation-preview')?.data).toMatchObject({
    features: [{ geometry: { coordinates: [51.5310404123, 25.2854474567] } }],
  });
  expect(MapSdkFixture.instances).toHaveLength(1);
  fireEvent.click(screen.getByText('cancel'));
  expect(screen.getByText('none')).toBeInTheDocument();
  expect(screen.getByText('manual hidden')).toBeInTheDocument();
  view.unmount();
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
