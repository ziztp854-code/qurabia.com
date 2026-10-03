import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
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

it('queues a server-resolved distant location before async SDK creation without remounting', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  function Scene() {
    const { focusLocation, container } = useWorldMap('world', 'viewer');
    useEffect(() => {
      focusLocation({ longitude: 42, latitude: 25 }, 9);
    }, [focusLocation]);
    return <div ref={container} />;
  }
  const view = render(<Scene />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0]!;
  expect(map.initialCamera).toMatchObject({ center: [42, 25], zoom: 9 });
  view.rerender(<Scene />);
  expect(MapSdkFixture.instances).toHaveLength(1);
  view.unmount();
});

it.each([
  [320, 700],
  [1000, 300],
  [0, 0],
])(
  'fits the full globe to a %s by %s canvas and resets camera tilt without rebuilding it',
  async (width, height) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
    );
    function Scene() {
      const map = useWorldMap('world', 'viewer');
      return (
        <>
          <div ref={map.container} />
          <button onClick={() => map.moveCamera('overview')}>overview</button>
          <button onClick={() => map.setProjection('mercator')}>flat</button>
          <output>{map.projection}</output>
        </>
      );
    }
    const view = render(<Scene />);
    await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
    const map = MapSdkFixture.instances[0]!;
    Object.defineProperties(map.canvas, {
      clientWidth: { value: width },
      clientHeight: { value: height },
    });
    fireEvent.click(screen.getByText('flat'));
    fireEvent.click(screen.getByText('overview'));
    expect(screen.getByText('globe')).toBeInTheDocument();
    const expectedZoom = width === 0 ? 1.5 : Math.log2(Math.min(width, height) / 256);
    expect(map.lastCamera).toMatchObject({ zoom: expectedZoom, pitch: 0, bearing: 0 });
    expect(MapSdkFixture.instances).toHaveLength(1);
    view.unmount();
  },
);

it.each([false, true])(
  'returns home to the accepted village location (public=%s) instead of its old initial coordinates',
  async (publicMap) => {
    const payload = approvedPayload();
    const relocated = {
      ...payload,
      layers: {
        ...payload.layers,
        cities: {
          ...payload.layers.cities,
          features: payload.layers.cities.features.map((city) => ({
            ...city,
            geometry: { type: 'Point' as const, coordinates: [31.6, 30.3] },
          })),
        },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(publicMap ? { 'X-Mamluk-Public-Settlements': '1' } : {}),
        json: async () => relocated,
      }),
    );
    function Scene() {
      const map = useWorldMap('world', 'viewer', { longitude: 31.2, latitude: 30 }, 'cairo');
      return (
        <>
          <div ref={map.container} />
          <button onClick={() => map.moveCamera('home')}>home</button>
        </>
      );
    }
    const view = render(<Scene />);
    await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
    fireEvent.click(screen.getByText('home'));
    expect(MapSdkFixture.instances[0]!.lastCamera).toMatchObject({
      center: [31.6, 30.3],
      zoom: 6.5,
    });
    view.unmount();
  },
);

it('marks the SDK canvas ready only after idle and clears readiness when movement begins', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  function Scene() {
    const map = useWorldMap('world', 'viewer');
    return <div ref={map.container} />;
  }
  const view = render(<Scene />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0]!;
  expect(map.canvas).not.toHaveAttribute('data-map-ready');
  act(() => map.fire('idle'));
  expect(map.canvas).toHaveAttribute('data-map-ready', 'true');
  act(() => map.fire('movestart'));
  expect(map.canvas).not.toHaveAttribute('data-map-ready');
  view.unmount();
});

it('reviews a temporary map destination without relocating or rebuilding the canvas and clears it on selection or viewer changes', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() });
  vi.stubGlobal('fetch', fetch);
  function Scene({ viewer = 'viewer' }: { viewer?: string }) {
    const map = useWorldMap('world', viewer, undefined, 'cairo');
    return (
      <>
        <div ref={map.container} />
        <button onClick={map.startPickingDestination}>pick</button>
        <button onClick={map.reviewDestination}>review</button>
        <button onClick={map.cancelDestination}>cancel</button>
        <button onClick={() => map.setSelected(null)}>close</button>
        <button onClick={() => map.setSelected({ layer: 'cities', id: 'cairo' })}>select</button>
        <output>
          {map.destination ? `${map.destination.longitude}/${map.destination.latitude}` : 'none'}
        </output>
        <output>{map.isPickingDestination ? 'picking' : 'reviewing'}</output>
      </>
    );
  }
  const view = render(<Scene />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0];
  fireEvent.click(screen.getByText('pick'));
  await screen.findByText('picking');
  await act(async () =>
    map.fire('click', { lngLat: { lng: 51.53104, lat: 25.285447 }, point: { x: 1, y: 1 } }),
  );
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
  await act(async () =>
    map.fire('click', { lngLat: { lng: 51.6, lat: 25.3 }, point: { x: 1, y: 1 } }),
  );
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
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  function Scene() {
    const map = useWorldMap('world', 'viewer', undefined, 'cairo');
    return (
      <>
        <div ref={map.container} />
        <button onClick={map.startPickingDestination}>pick</button>
        <button onClick={map.useMapCenterDestination}>center</button>
        <button onClick={map.requestManualDestination}>manual</button>
        <button
          onClick={() =>
            map.changeDestination({ longitude: 51.5310404123, latitude: 25.2854474567 })
          }
        >
          edit
        </button>
        <button onClick={() => map.setProjection('mercator')}>projection</button>
        <button onClick={map.cancelDestination}>cancel</button>
        <output>
          {map.destination ? `${map.destination.longitude}/${map.destination.latitude}` : 'none'}
        </output>
        <output>{map.isPickingDestination ? 'picking' : 'reviewing'}</output>
        <output>{map.manualEntryRequested ? 'manual visible' : 'manual hidden'}</output>
      </>
    );
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
