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

it('hides a selected layer and its directory state without recreating the map', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  function Scene() {
    const map = useWorldMap('world', 'viewer');
    return (
      <>
        <div ref={map.container} />
        <button onClick={() => map.setSelected({ layer: 'cities', id: 'city' })}>select</button>
        <button onClick={() => map.toggleLayer('cities')}>cities</button>
        <output>{map.selected?.id ?? 'none'}</output>
      </>
    );
  }
  const view = render(<Scene />);
  await waitFor(() => expect(MapSdkFixture.instances[0]?.sources.size).toBe(9));
  const map = MapSdkFixture.instances[0]!;
  fireEvent.click(screen.getByText('select'));
  fireEvent.click(screen.getByText('cities'));
  expect(screen.getByText('none')).toBeInTheDocument();
  expect(map.layoutCalls).toContainEqual(['mamluk-cities', 'visibility', 'none']);
  expect(map.layers.get('mamluk-cities')).toMatchObject({ layout: { visibility: 'none' } });
  expect(MapSdkFixture.instances).toHaveLength(1);
  view.unmount();
});

it('keeps one map instance, camera and hidden layer through poll, retry, lifecycle, expiry and overview', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  let visibility = 'visible';
  let online = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  const urls: string[] = [];
  let failing = false;
  let ttlMs = 60000;
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    urls.push(url);
    if (failing) throw new TypeError('Failed to fetch');
    const query = new URL(url, 'http://localhost').searchParams;
    if (url.includes('/overview?'))
      return {
        ok: true,
        json: async () => ({
          worldId: 'world',
          revision: '1',
          serverTime: 1000,
          cells: { type: 'FeatureCollection', features: [] },
        }),
      };
    const base = approvedPayload('world', String(urls.length));
    return {
      ok: true,
      headers: new Headers({ 'X-Mamluk-Public-Settlements': '1' }),
      json: async () => ({
        ...base,
        expiresAt: base.serverTime + ttlMs,
        bounds: {
          west: Number(query.get('west')),
          south: Number(query.get('south')),
          east: Number(query.get('east')),
          north: Number(query.get('north')),
        },
      }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  function Scene() {
    const map = useWorldMap('world', 'viewer');
    return (
      <>
        <div ref={map.container} />
        <button onClick={() => map.toggleLayer('cities')}>cities</button>
      </>
    );
  }
  const view = render(<Scene />);
  const settle = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  await settle(0);
  await settle(0);
  const map = MapSdkFixture.instances[0]!;
  expect(map.sources.size).toBe(9);
  fireEvent.click(screen.getByText('cities'));
  const cities = () => map.layers.get('mamluk-cities') as { layout?: { visibility?: string } };
  expect(cities().layout?.visibility).toBe('none');
  const camera = { center: map.lastCamera?.center, zoom: map.lastCamera?.zoom };
  const source = map.sources.get('mamluk-cities');

  await settle(5000); // poll
  failing = true;
  await settle(20000); // retry with backoff
  failing = false;
  await settle(30000); // recovery
  ttlMs = 2000;
  await settle(6000); // expiry-driven refresh
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await settle(10000);
  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await settle(0);
  online = false;
  window.dispatchEvent(new Event('offline'));
  await settle(10000);
  online = true;
  window.dispatchEvent(new Event('online'));
  await settle(0);
  map.bounds = { west: -120, east: 120, south: -50, north: 50 };
  map.fire('moveend');
  await settle(300);
  expect(urls.at(-1)).toContain('/overview?');
  map.bounds = { west: 28, south: 25, east: 40, north: 36 };
  map.fire('moveend');
  await settle(300);
  expect(urls.at(-1)).toContain('/viewport?');

  expect(MapSdkFixture.instances).toHaveLength(1);
  expect(map.removed).toBe(false);
  expect(map.sources.get('mamluk-cities')).toBe(source);
  expect(cities().layout?.visibility).toBe('none');
  expect({ center: map.lastCamera?.center, zoom: map.lastCamera?.zoom }).toEqual(camera);
  view.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
